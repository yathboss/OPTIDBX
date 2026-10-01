"""Tests for user-selectable workload types and starting-config request fields."""

import random

import pytest
from pydantic import ValidationError

from backend.models.workload import WorkloadStartRequest
from workload import queries


def test_workload_type_catalogue_is_consistent():
    meta_ids = [t["id"] for t in queries.WORKLOAD_TYPE_META]
    assert set(meta_ids) == set(queries.WORKLOAD_TYPES)
    for entry in queries.WORKLOAD_TYPE_META:
        assert entry["label"] and entry["description"]


def test_analytical_query_is_the_shared_aggregate():
    rng = random.Random(0)
    assert queries.next_query("ANALYTICAL", 1000, rng) == queries.ANALYTICAL


def test_read_query_is_a_single_row_lookup():
    rng = random.Random(1)
    sql = queries.next_query("READ", 500, rng)
    assert sql.startswith("SELECT abalance FROM pgbench_accounts WHERE aid =")
    assert "UPDATE" not in sql


def test_write_query_updates_one_row():
    rng = random.Random(2)
    sql = queries.next_query("WRITE", 500, rng)
    assert sql.startswith("UPDATE pgbench_accounts SET abalance = abalance +")
    assert "WHERE aid =" in sql


def test_mixed_produces_both_reads_and_writes():
    rng = random.Random(3)
    kinds = {queries.next_query("MIXED", 500, rng).split()[0] for _ in range(200)}
    assert {"SELECT", "UPDATE"} <= kinds


def test_generated_ids_are_within_range():
    rng = random.Random(4)
    for _ in range(200):
        sql = queries.next_query("READ", 10, rng)
        aid = int(sql.rsplit("=", 1)[1])
        assert 1 <= aid <= 10


def test_unknown_workload_type_raises():
    with pytest.raises(ValueError, match="Unknown workload type"):
        queries.next_query("SIDEWAYS", 10, random.Random(0))


def test_start_request_defaults_preserve_legacy_behaviour():
    req = WorkloadStartRequest()
    assert req.workload_type == "ANALYTICAL"
    assert req.initial_parallelism is None
    assert req.initial_work_mem_mb is None


def test_start_request_accepts_new_fields():
    req = WorkloadStartRequest(
        profile="HIGH",
        duration_seconds=60,
        workload_type="MIXED",
        initial_parallelism=8,
        initial_work_mem_mb=16,
    )
    assert req.workload_type == "MIXED"
    assert req.initial_parallelism == 8
    assert req.initial_work_mem_mb == 16


@pytest.mark.parametrize(
    "kwargs",
    [
        {"workload_type": "SIDEWAYS"},
        {"initial_parallelism": 0},
        {"initial_parallelism": "8"},
        {"initial_work_mem_mb": 0},
        {"duration_seconds": 10},
    ],
)
def test_start_request_rejects_invalid_values(kwargs):
    with pytest.raises(ValidationError):
        WorkloadStartRequest(**kwargs)
