"""Precompute every hourly issuance of a scenario to disk so the API serves
the time machine instantly on startup.

    python -m cascade.bake                 # all scenarios
    python -m cascade.bake monsoon-2023
"""

from __future__ import annotations

import gzip
import json
import sys
import time
from pathlib import Path

from . import scenarios
from .service import Session
from .validation import validate

BAKED = Path(__file__).resolve().parent.parent / "data" / "baked"


def _default(o):
    import numpy as np

    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    raise TypeError(type(o))


def bake(sid: str) -> None:
    t0 = time.time()
    s = Session(sid)
    s.wait_snap(s.sc.hours - 1, timeout=3600)
    out = BAKED / sid
    out.mkdir(parents=True, exist_ok=True)
    for h, p in s.payloads.items():
        with gzip.open(out / f"{h}.json.gz", "wt", encoding="utf-8") as f:
            json.dump(p, f, default=_default, separators=(",", ":"))
    with gzip.open(out / "validation.json.gz", "wt", encoding="utf-8") as f:
        json.dump(validate(s), f, default=_default, separators=(",", ":"))
    print(f"[bake] {sid}: {len(s.payloads)} issuances in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    for sid in sys.argv[1:] or list(scenarios.SCENARIOS):
        bake(sid)
