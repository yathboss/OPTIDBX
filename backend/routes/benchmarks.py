"""Performance evidence endpoints; reports contain measurements, never sample claims."""

import csv
import io
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import JSONResponse, Response

from backend.services.workload_service import get_workload_service
from experiments.benchmark import BenchmarkRequest, BenchmarkService

router = APIRouter(prefix="/benchmarks", tags=["performance evidence"])


@lru_cache(maxsize=1)
def for_manager(manager):
    return BenchmarkService(manager)


def get_benchmarks(service=Depends(get_workload_service)):
    try:
        return for_manager(service.manager)
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "Evidence storage unavailable or corrupt") from exc


@router.get("")
def list_benchmarks(service=Depends(get_benchmarks)):
    try:
        records = service.store.list()
        current = service.status()
        if current:
            records = [current] + [r for r in records if r["id"] != current["id"]]
        return records
    except (OSError, ValueError) as exc:
        raise HTTPException(503, "Evidence storage unavailable or corrupt") from exc


@router.post("/start")
def start_benchmark(request: BenchmarkRequest, service=Depends(get_benchmarks)):
    try:
        return service.start(request)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except OSError as exc:
        raise HTTPException(503, "Cannot persist evidence before starting") from exc


@router.post("/cancel")
def cancel_benchmark(service=Depends(get_benchmarks)):
    return service.cancel()


@router.get("/{identifier}/export")
def export_benchmark(identifier: str, format: str = "json", service=Depends(get_benchmarks)):
    try:
        current = service.status()
        record = (
            current if current and current["id"] == identifier else service.store.get(identifier)
        )
    except FileNotFoundError as exc:
        raise HTTPException(404, "Unknown benchmark") from exc
    except ValueError as exc:
        raise HTTPException(422, "Invalid benchmark identifier") from exc
    if format == "json":
        return JSONResponse(
            record,
            headers={
                "Content-Disposition": f'attachment; filename="benchmark-{record["id"]}.json"'
            },
        )
    if format != "csv":
        raise HTTPException(422, "Choose json or csv")
    output = io.StringIO()
    fields = [
        "pair",
        "mode",
        "experiment_id",
        "status",
        "throughput_qps",
        "median_latency_ms",
        "p95_latency_ms",
        "successful_queries",
        "errors",
        "timeouts",
        "elapsed_seconds",
    ]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for run in record["runs"]:
        writer.writerow({**run, **(run.get("metrics") or {})})
    return Response(
        output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="benchmark-{record["id"]}.csv"'},
    )
