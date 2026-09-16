"""OptiDBX FastAPI Application Entrypoint.

Provides telemetry, autotuner orchestration status, and evaluation APIs
for the OptiDBX Dashboard and developer clients.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.routes.health import router as health_router
from backend.routes.metrics import router as metrics_router
from backend.routes.tuner import router as tuner_router
from backend.routes.experiments import router as experiments_router

app = FastAPI(
    title="OptiDBX Backend API",
    description="Adaptive OS-DBMS Co-Tuning Telemetry & Control API",
    version="1.0.0",
)

# Enable CORS for React frontend (Vite/CRA)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include subrouters
app.include_router(health_router)
app.include_router(metrics_router)
app.include_router(tuner_router)
app.include_router(experiments_router)


@app.get("/")
def root():
    return {
        "system": "OptiDBX",
        "description": "Adaptive OS-DBMS Co-Tuning System API",
        "status": "online",
        "docs_url": "/docs",
    }

