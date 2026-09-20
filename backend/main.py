"""OptiDBX FastAPI Application Entrypoint.

Provides telemetry, autotuner orchestration status, and evaluation APIs
for the OptiDBX Dashboard and developer clients.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from backend.routes.benchmarks import for_manager
from backend.routes.benchmarks import router as benchmarks_router
from backend.routes.experiments import router as experiments_router
from backend.routes.demo import router as demo_router
from backend.routes.health import router as health_router
from backend.routes.metrics import router as metrics_router
from backend.routes.tuner import router as tuner_router
from backend.routes.workload import router as workload_router
from backend.services.live_runtime import get_runtime


@asynccontextmanager
async def lifespan(app):
    yield
    if get_runtime.cache_info().currsize:
        from backend.services.workload_service import service_for_runtime

        if service_for_runtime.cache_info().currsize:
            service = service_for_runtime(get_runtime())
            if service.manager.reservation:
                benchmark = for_manager(service.manager)
                benchmark.cancel()
                if benchmark.thread:
                    benchmark.thread.join(timeout=25)
            else:
                service.stop()
        get_runtime().stop()


app = FastAPI(
    lifespan=lifespan,
    title="OptiDBX Backend API",
    description="Adaptive OS-DBMS Co-Tuning Telemetry & Control API",
    version="1.0.0",
)

TRUSTED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]


@app.middleware("http")
async def protect_local_controls(request, call_next):
    if (
        request.method not in {"GET", "HEAD", "OPTIONS"}
        and request.headers.get("origin") is not None
        and request.headers["origin"] not in TRUSTED_ORIGINS
    ):
        return JSONResponse({"detail": "Untrusted browser origin"}, status_code=403)
    if request.method == "POST" and request.url.path.startswith(("/workload/", "/tuner/")):
        from backend.services.workload_service import service_for_runtime

        if service_for_runtime(get_runtime()).manager.reservation:
            return JSONResponse(
                {"detail": "A benchmark owns these controls. Cancel the comparison first."},
                status_code=409,
            )
    return await call_next(request)


# Register CORS last so it also wraps early control-conflict responses.
# Otherwise browsers hide their 409 explanation as a generic fetch failure.
app.add_middleware(
    CORSMiddleware,
    allow_origins=TRUSTED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include subrouters
app.include_router(health_router)
app.include_router(metrics_router)
app.include_router(tuner_router)
app.include_router(experiments_router)
app.include_router(workload_router)
app.include_router(benchmarks_router)
app.include_router(demo_router)


@app.get("/")
def root():
    return {
        "system": "OptiDBX",
        "description": "Adaptive OS-DBMS Co-Tuning System API",
        "status": "online",
        "docs_url": "/docs",
    }
