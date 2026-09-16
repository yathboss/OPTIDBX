"""python -m autotuner: real collectors, recommendation-only mode."""

import argparse
import logging

from autotuner.runtime import AutotunerRuntime
from config.config_loader import load_config
from db_monitor.storage import save_recommendation


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", help="Shared YAML configuration path")
    parser.add_argument("--samples", type=int, help="Stop after this many valid intervals")
    parser.add_argument("--experiment-id", type=int)
    parser.add_argument("--no-persist", action="store_true", help="Display recommendations only")
    args = parser.parse_args()
    if args.samples is not None and args.samples < 1:
        parser.error("--samples must be positive")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    runtime = AutotunerRuntime(load_config(args.config), experiment_id=args.experiment_id,
                              recommendation_store=None if args.no_persist else save_recommendation)
    try:
        for _ in runtime.run(args.samples):
            print(runtime.get_status().model_dump_json(), flush=True)
    except KeyboardInterrupt:
        pass
    finally:
        runtime.stop()


if __name__ == "__main__":
    main()
