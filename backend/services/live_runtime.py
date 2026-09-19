"""One live runtime per API process; use one uvicorn worker for this phase."""

from functools import lru_cache

from fastapi import HTTPException

from autotuner.runtime import AutotunerRuntime
from backend.models.metrics import CurrentMetricsResponse
from backend.models.tuner import TunerStatusResponse, TuningActionItem
from db_monitor.storage import save_recommendation


@lru_cache(maxsize=1)
def get_runtime():
    return AutotunerRuntime(recommendation_store=save_recommendation)


class LiveTunerProvider:
    def __init__(self, runtime):
        self.runtime = runtime

    def get_status(self):
        status = self.runtime.get_status()
        action = status.recommended_action
        summary = None
        if action is not None:
            summary = (
                (f"{action.parameter}: {action.old_value} -> {action.new_value} ({action.status})")
                if action.new_value is not None
                else action.reason
            )
        return TunerStatusResponse(
            mode=status.mode,
            state=status.state,
            detected_bottleneck=status.detected_bottleneck,
            reason=status.reason,
            recommended_action=summary,
            evidence=status.evidence,
            recommendation=action,
            telemetry_available=status.telemetry_available,
            last_error=status.last_error,
            running=status.running,
            persistence_status=status.persistence_status,
            consecutive_bad_readings=getattr(status, "consecutive_bad_readings", 0),
        )

    def set_mode(self, mode):
        if mode != "recommendation":
            raise HTTPException(status_code=422, detail="Phase 2 supports recommendation mode only")
        return self.get_status()

    def set_monitoring(self, active):
        self.runtime.start() if active else self.runtime.stop()
        return self.get_status()

    def get_history(self):
        in_memory = [
            TuningActionItem(
                timestamp=result.recommended_action.timestamp.isoformat(),
                bottleneck=result.bottleneck.bottleneck_type,
                parameter=result.recommended_action.parameter,
                old_value=result.recommended_action.old_value,
                new_value=result.recommended_action.new_value,
                status=result.recommended_action.status,
                reason=result.bottleneck.reason,
            )
            for result in self.runtime.get_recommendations()
        ]
        if in_memory:
            return in_memory

        # Fallback to persistent storage if in-memory history has not recorded actions yet
        try:
            from db_monitor.storage import get_connection
            from psycopg2.extras import RealDictCursor
            import json

            conn = get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT timestamp, parameter, old_value, new_value, reason, status "
                        "FROM tuning_actions ORDER BY timestamp DESC LIMIT 20;"
                    )
                    rows = list(cur.fetchall())
                    items = []
                    for r in rows:
                        bottleneck = "CPU_PARALLELISM"
                        reason_text = r["reason"]
                        try:
                            envelope = json.loads(r["reason"])
                            bottleneck = envelope.get("bottleneck", bottleneck)
                            reason_text = envelope.get("reason", reason_text)
                        except Exception:
                            pass
                        items.append(
                            TuningActionItem(
                                timestamp=r["timestamp"].isoformat()
                                if hasattr(r["timestamp"], "isoformat")
                                else str(r["timestamp"]),
                                bottleneck=bottleneck,
                                parameter=r["parameter"],
                                old_value=r["old_value"],
                                new_value=r["new_value"],
                                status=r["status"],
                                reason=reason_text,
                            )
                        )
                    return items
            finally:
                conn.close()
        except Exception:
            pass

        return []


class LiveMetricsProvider:
    def __init__(self, runtime):
        self.runtime = runtime

    @staticmethod
    def serialize(sample):
        return CurrentMetricsResponse(
            timestamp=sample.timestamp.isoformat(),
            os=sample.os_metrics.model_dump(exclude={"timestamp"}),
            db=sample.db_metrics.model_dump(exclude={"timestamp"}),
        )

    def get_current_metrics(self):
        if not self.runtime.get_status().telemetry_available:
            raise HTTPException(status_code=503, detail="No fresh paired telemetry available")
        samples = self.runtime.get_history(1)
        if not samples:
            raise HTTPException(status_code=503, detail="Waiting for real telemetry")
        return self.serialize(samples[-1])

    def get_metrics_history(self, limit=20):
        return [self.serialize(sample) for sample in self.runtime.get_history(limit)]
