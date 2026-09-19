"""
OptiDBX Workload Profiles
Defines standard PostgreSQL workload configurations for repeatable benchmarking.
"""

from typing import Dict, Any

DEFAULT_PROFILES: Dict[str, Dict[str, Any]] = {
    "LOW": {
        "clients": 2,
        "threads": 2,
        "duration_seconds": 60,
        "scale_factor": 10,
        "description": "Low concurrency baseline (2 clients)",
    },
    "MEDIUM": {
        "clients": 10,
        "threads": 4,
        "duration_seconds": 60,
        "scale_factor": 20,
        "description": "Moderate concurrency workload (10 clients)",
    },
    "HIGH": {
        "clients": 50,
        "threads": 8,
        "duration_seconds": 90,
        "scale_factor": 50,
        "description": "High concurrency workload designed to saturate CPU/parallel workers",
    },
}


def get_profile(profile_name: str) -> Dict[str, Any]:
    """Retrieve workload profile by name."""
    profile_upper = profile_name.upper()
    if profile_upper not in DEFAULT_PROFILES:
        raise ValueError(
            f"Unknown profile '{profile_name}'. Available: {list(DEFAULT_PROFILES.keys())}"
        )
    return DEFAULT_PROFILES[profile_upper].copy()

