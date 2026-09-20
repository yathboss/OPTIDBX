"""Opt-in real API/PostgreSQL validation. Runs a bounded HIGH workload.

The database must already contain pgbench tables and the OptiDBX schema.
This does not lower detection thresholds or manufacture performance samples.
"""

import argparse
import json
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://localhost:8000")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    def request(path, body=None):
        payload = json.dumps(body).encode() if body is not None else None
        req = Request(args.api + path, data=payload, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=30) as response:
            return json.load(response)

    evidence = {
        "validation": "REAL PostgreSQL and OS telemetry",
        "started_at": datetime.now(UTC).isoformat(),
        "status_samples": [],
    }
    workload = request("/workload/start", {"profile": "HIGH", "duration_seconds": 180})
    evidence["experiment_id"] = workload["experiment_id"]
    complete = False
    try:
        request("/tuner/mode", {"mode": "auto"})
        deadline = time.monotonic() + 165
        while time.monotonic() < deadline:
            status = request("/tuner/status")
            action = status.get("active_action") or {}
            evidence["status_samples"].append(
                {
                    "at": datetime.now(UTC).isoformat(),
                    "state": status["state"],
                    "telemetry_available": status["telemetry_available"],
                    "cooldown_remaining_seconds": status["cooldown_remaining_seconds"],
                    "observation_remaining_seconds": status["observation_remaining_seconds"],
                    "evidence": status["evidence"],
                }
            )
            if status["recovery_required"]:
                raise RuntimeError("Rollback unresolved; inspect original sessions and journal")
            if action.get("outcome") in ("KEEP", "ROLLBACK"):
                request("/tuner/mode", {"mode": "recommendation"})
                if "MONITORING" in action["transitions"]:
                    evidence["action"] = action
                    assert action["baseline_samples"] >= 3
                    assert action["observation_samples"] >= 5
                    assert action["observation_elapsed_seconds"] >= 30
                    assert action["verified_applied_value"] == action["action"]["new_value"]
                    if action["outcome"] == "ROLLBACK":
                        assert action["verified_restored_value"] == action["action"]["old_value"]
                    complete = True
                    break
            time.sleep(2)
        evidence["cycle_completed"] = complete
        if not complete:
            raise RuntimeError("No complete live cycle within the deadline; no improvement claim")
    finally:
        evidence["workload_end"] = request("/workload/stop", {})
        run_id = evidence["experiment_id"]
        evidence["experiment"] = request(f"/experiments/{run_id}")
        evidence["telemetry"] = request(f"/metrics/history?experiment_id={run_id}&limit=100")
        evidence["finished_at"] = datetime.now(UTC).isoformat()
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "experiment_id": run_id,
                "cycle_completed": complete,
                "outcome": evidence["action"]["outcome"],
                "paired_samples": len(evidence["telemetry"]),
                "evidence": str(args.output),
            }
        )
    )


if __name__ == "__main__":
    main()
