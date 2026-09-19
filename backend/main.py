"""OptiDBX FastAPI Application Entrypoint.

Provides telemetry, autotuner orchestration status, and evaluation APIs
for the OptiDBX Dashboard and developer clients.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from backend.routes.experiments import router as experiments_router
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
            service_for_runtime(get_runtime()).stop()
        get_runtime().stop()


app = FastAPI(
    lifespan=lifespan,
    title="OptiDBX Backend API",
    description="Adaptive OS-DBMS Co-Tuning Telemetry & Control API",
    version="1.0.0",
)

# Enable CORS for React frontend (Vite/CRA)
TRUSTED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=TRUSTED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def protect_local_controls(request, call_next):
    if (
        request.method not in {"GET", "HEAD", "OPTIONS"}
        and request.headers.get("origin") is not None
        and request.headers["origin"] not in TRUSTED_ORIGINS
    ):
        return JSONResponse({"detail": "Untrusted browser origin"}, status_code=403)
    return await call_next(request)


# Include subrouters
app.include_router(health_router)
app.include_router(metrics_router)
app.include_router(tuner_router)
app.include_router(experiments_router)
app.include_router(workload_router)


@app.get("/")
def root():
    return {
        "system": "OptiDBX",
        "description": "Adaptive OS-DBMS Co-Tuning System API",
        "status": "online",
        "docs_url": "/docs",
    }
