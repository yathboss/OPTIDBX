"""Experiment and evaluation benchmark endpoints."""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from backend.models.experiment import ExperimentItem, ExperimentDetailResponse
from backend.services.experiment_service import ExperimentService, get_experiment_service

router = APIRouter(prefix="/experiments", tags=["experiments"])


@router.get("", response_model=List[ExperimentItem])
def list_experiments(
    experiment_service: ExperimentService = Depends(get_experiment_service),
) -> List[ExperimentItem]:
    """Lists all benchmark experiments and workloads."""
    return experiment_service.list_experiments()


@router.get("/{experiment_id}", response_model=ExperimentDetailResponse)
def get_experiment_detail(
    experiment_id: str,
    experiment_service: ExperimentService = Depends(get_experiment_service),
) -> ExperimentDetailResponse:
    """Returns detailed metrics and evaluation of a specific experiment."""
    exp = experiment_service.get_experiment(experiment_id)
    if not exp:
        raise HTTPException(status_code=404, detail=f"Experiment '{experiment_id}' not found")
    return exp

