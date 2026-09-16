"""Health check endpoint for OptiDBX API."""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def get_health():
    """Returns basic system health status."""
    return {"status": "ok"}

