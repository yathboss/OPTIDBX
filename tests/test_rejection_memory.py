"""Rejected-reduction memory: unit behavior and engine suppression."""

from datetime import UTC, datetime, timedelta

from autotuner.engine import AutotunerEngine
from autotuner.rejection_memory import RejectedReductionMemory, condition_signature


def test_condition_signature_buckets_are_noise_tolerant_but_shift_sensitive():
    assert condition_signature(8, 94) == condition_signature(9, 91)  # same coarse bands
    assert condition_signature(8, 94) != condition_signature(4, 94)  # worker band changed
    assert condition_signature(8, 94) != condition_signature(8, 70)  # cpu band changed


def test_memory_suppresses_same_condition_and_reconsiders_others():
    mem = RejectedReductionMemory(ttl_seconds=100)
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    mem.record((8, 6), "w2:c9", "degraded", t0)
    suppressed, reason = mem.is_suppressed((8, 6), "w2:c9", t0 + timedelta(seconds=10))
    assert suppressed and "Skipped reducing 8->6" in reason
    # Materially different conditions or a different transition are reconsidered now.
    assert mem.is_suppressed((8, 6), "w1:c9", t0)[0] is False
    assert mem.is_suppressed((6, 4), "w2:c9", t0)[0] is False
    # The entry expires after its TTL so it can be reconsidered later.
    assert mem.is_suppressed((8, 6), "w2:c9", t0 + timedelta(seconds=101))[0] is False


def test_memory_counts_repeated_rejections():
    mem = RejectedReductionMemory(1000)
    t0 = datetime(2026, 1, 1, tzinfo=UTC)
    mem.record((8, 6), "s", "r", t0)
    mem.record((8, 6), "s", "r", t0)
    assert "2x" in mem.is_suppressed((8, 6), "s", t0)[1]


def test_engine_suppresses_a_remembered_reduction(sample):
    mem = RejectedReductionMemory(10000)
    mem.record(
        (8, 6),
        condition_signature(8, 94),
        "Degraded or insufficient improvement across observation metrics",
        datetime.fromisoformat(sample(0)["timestamp"]),
    )
    engine = AutotunerEngine(rejection_memory=mem)
    result = None
    for i in range(3):
        result = engine.process(sample(i), current_parallelism=8)
    assert result.recommended_action is None
    assert "Skipped reducing 8->6" in engine.get_status().reason


def test_engine_still_recommends_under_different_conditions(sample):
    mem = RejectedReductionMemory(10000)
    # Remembered only for a lower-worker band; the sample runs at 8 workers.
    mem.record((8, 6), condition_signature(0, 94), "degraded", datetime.fromisoformat(sample(0)["timestamp"]))
    engine = AutotunerEngine(rejection_memory=mem)
    result = None
    for i in range(3):
        result = engine.process(sample(i), current_parallelism=8)
    assert result.recommended_action is not None
    assert result.recommended_action.new_value == 6
