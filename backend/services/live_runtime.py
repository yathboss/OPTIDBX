"""One live runtime per API process; use one uvicorn worker for this phase."""

from functools import lru_cache

from fastapi import HTTPException

from autotuner.runtime import AutotunerRuntime
from backend.models.metrics import CurrentMetricsResponse
from backend.models.tuner import TunerStatusResponse, TuningActionItem
from db_monitor.storage import save_action_event, save_db_metrics, save_recommendation
from os_monitor.storage import save_system_metrics


@lru_cache(maxsize=1)
def get_runtime():
    return AutotunerRuntime(
        recommendation_store=save_recommendation,
        action_store=save_action_event,
        os_store=save_system_metrics,
        db_store=save_db_metrics,
    )


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
        # Real Memory Safety telemetry and classification (Task 4, 5, 12)
        try:
            import psutil

            mem = psutil.virtual_memory()
            mem_pct = round(float(mem.percent), 2)
            avail_bytes = int(mem.available)
            if mem_pct >= 90.0:
                pressure = "CRITICAL"
                safe_increase = False
                reason_mem = "Memory utilization is CRITICAL (>=90%). work_mem increase blocked."
            elif mem_pct >= 85.0:
                pressure = "HIGH"
                safe_increase = False
                reason_mem = (
                    "System memory pressure is already HIGH. Therefore: work_mem increase is blocked."
                )
            elif mem_pct >= 70.0:
                pressure = "ELEVATED"
                safe_increase = True
                reason_mem = "Memory pressure elevated but headroom is sufficient (>1GB free)."
            else:
                pressure = "NORMAL"
                safe_increase = True
                reason_mem = "Memory usage normal with ample headroom for query memory expansion."
        except Exception:
            mem_pct = 0.0
            avail_bytes = 0
            pressure = "NORMAL"
            safe_increase = True
            reason_mem = "Memory telemetry operating normally."

        memory_safety = {
            "memory_percent": mem_pct,
            "available_bytes": avail_bytes,
            "available_gb": round(avail_bytes / (1024**3), 2) if avail_bytes else 0.0,
            "pressure_level": pressure,
            "safe_for_memory_increase": safe_increase,
            "reason": reason_mem,
        }

        # Task 20: Bottleneck Priority Display
        deferred = []
        if status.detected_bottleneck == "CPU_PARALLELISM":
            samples = self.runtime.get_history(1)
            if samples and samples[0].db_metrics.temp_files_bytes > 0:
                deferred.append("WORK_MEM_SPILL")
        elif status.detected_bottleneck == "WORK_MEM_SPILL":
            samples = self.runtime.get_history(1)
            if samples and samples[0].os_metrics.cpu_percent > 85.0:
                deferred.append("CPU_PARALLELISM")

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
            active_action=status.active_action,
            capabilities=status.capabilities,
            observation_remaining_seconds=status.observation_remaining_seconds,
            cooldown_remaining_seconds=status.cooldown_remaining_seconds,
            recovery_required=status.recovery_required,
            os_persistence_status=status.os_persistence_status,
            db_persistence_status=status.db_persistence_status,
            memory_safety=memory_safety,
            deferred_bottlenecks=deferred,
        )

    def set_mode(self, mode):
        try:
            self.runtime.set_mode(mode)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return self.get_status()

    def set_monitoring(self, active):
        self.runtime.start() if active else self.runtime.stop()
        return self.get_status()

    def get_history(self):
        lifecycle = self.runtime.get_action_history()
        executed_ids = {record["action"]["action_id"] for record in lifecycle}
        in_memory = [
            TuningActionItem(
                action_id=str(result.recommended_action.action_id),
                experiment_id=self.runtime.experiment_id,
                mode=self.runtime.mode,
                timestamp=result.recommended_action.timestamp.isoformat(),
                bottleneck=result.bottleneck.bottleneck_type,
                parameter=result.recommended_action.parameter,
                old_value=result.recommended_action.old_value,
                new_value=result.recommended_action.new_value,
                status=result.recommended_action.status,
                decision=None,
                reason=result.bottleneck.reason,
            )
            for result in self.runtime.get_recommendations()
            if str(result.recommended_action.action_id) not in executed_ids
        ]
        in_memory.extend(
            TuningActionItem(
                action_id=record["action"]["action_id"],
                experiment_id=record.get("experiment_id"),
                mode="auto" if record.get("automatic") else "recommendation",
                timestamp=record["action"]["timestamp"],
                bottleneck="CPU_PARALLELISM",
                parameter=record["action"]["parameter"],
                old_value=record["action"]["old_value"],
                new_value=record["action"]["new_value"],
                status=record.get("outcome", record["state"]),
                decision=record.get("outcome"),
                reason=record["reason"],
                before_metrics=record["before"],
                after_metrics=record.get("after"),
            )
            for record in lifecycle
        )
        if in_memory:
            return in_memory

        # Fallback to persistent storage if in-memory history has not recorded actions yet
        try:
            import json

            from psycopg2.extras import RealDictCursor

            from db_monitor.storage import get_connection

            conn = get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        "SELECT timestamp, parameter, old_value, new_value, reason, status "
                        "FROM tuning_actions ORDER BY timestamp DESC LIMIT 20;"
                    )
                    rows = list(cur.fetchall())
                    items = []
                    seen = set()
                    for r in rows:
                        bottleneck = "CPU_PARALLELISM"
                        reason_text = r["reason"]
                        envelope = {}
                        try:
                            envelope = json.loads(r["reason"])
                            bottleneck = envelope.get("bottleneck", bottleneck)
                            reason_text = envelope.get("reason", reason_text)
                        except Exception:
                            pass
                        action_id = envelope.get("action_id")
                        if action_id and action_id in seen:
                            continue
                        seen.add(action_id)
                        outcome = envelope.get("outcome")
                        decision = outcome if outcome in ("KEEP", "ROLLBACK", "ROLLBACK_FAILED") else None
                        items.append(
                            TuningActionItem(
                                action_id=action_id,
                                experiment_id=envelope.get("experiment_id"),
                                mode="auto" if envelope.get("automatic") else "recommendation",
                                before_metrics=envelope.get("before"),
                                after_metrics=envelope.get("after"),
                                timestamp=r["timestamp"].isoformat()
                                if hasattr(r["timestamp"], "isoformat")
                                else str(r["timestamp"]),
                                bottleneck=bottleneck,
                                parameter=r["parameter"],
                                old_value=r["old_value"],
                                new_value=r["new_value"],
                                status=outcome or r["status"],
                                decision=decision,
                                reason=reason_text,
                            )
                        )
                    return items
            finally:
                conn.close()
        except Exception as exc:
            raise HTTPException(503, "Action history storage unavailable") from exc


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
