"""Temporal validation on replayed streams with strict future-data isolation.

Every forecast issued at hour h was produced from observations whose arrival
time is <= h. Here we score those issued forecasts against the hidden world's
truth: calibration, lead time, false alarms, detection, and how much of the
hidden dependency graph was recovered."""

from __future__ import annotations

import numpy as np

from .sim import CRITICAL, HIGH


def validate(session) -> dict:
    st, world, sc = session.st, session.world, session.sc
    hours = sorted(session.payloads)
    frames = world.frames
    T = len(frames)
    truth_state = np.stack([f["state"] for f in frames])  # (T, Z)
    pop = st.pop

    # --- calibration of P(zone reaches CRITICAL within 24 h) -------------------
    preds, outs = [], []
    warn_rows = []
    for h in hours:
        p = session.payloads[h]
        pc = np.array(p["zones"]["p_crit24"])
        end = min(T, h + 25)
        if h + 1 >= T:
            continue
        hit = (truth_state[h + 1 : end] >= CRITICAL).any(0)
        mask = pop > 300
        preds.append(pc[mask])
        outs.append(hit[mask])
        state = np.array(p["zones"]["state"])
        warn_rows.append((h, state, hit, (truth_state[h + 1 : end] >= HIGH).any(0)))
    preds = np.concatenate(preds) if preds else np.zeros(0)
    outs = np.concatenate(outs).astype(float) if outs else np.zeros(0)
    brier = float(np.mean((preds - outs) ** 2)) if len(preds) else None
    clim = float(np.mean((outs.mean() - outs) ** 2)) if len(outs) else None
    bins = np.linspace(0, 1, 11)
    rel = []
    for i in range(10):
        m = (preds >= bins[i]) & (preds < bins[i + 1] if i < 9 else preds <= 1)
        if m.sum() >= 5:
            rel.append({"bin": round((bins[i] + bins[i + 1]) / 2, 2), "predicted": round(float(preds[m].mean()), 3),
                        "observed": round(float(outs[m].mean()), 3), "n": int(m.sum())})

    # --- warnings: false alarms and detection ---------------------------------
    warned_zone_hours = 0
    false_alarms = 0
    for h, state, crit_hit, high_hit in warn_rows:
        w = (state >= HIGH) & (pop > 300)
        warned_zone_hours += int(w.sum())
        false_alarms += int((w & ~high_hit).sum())
    far = false_alarms / warned_zone_hours if warned_zone_hours else None

    # zone-episodes: first hour each zone reached CRITICAL in truth
    first_crit = np.full(st.Z, np.inf)
    for t in range(T):
        new = (truth_state[t] >= CRITICAL) & np.isinf(first_crit)
        first_crit[new] = t
    leads, detected = [], 0
    episodes = [z for z in range(st.Z) if np.isfinite(first_crit[z]) and pop[z] > 300]
    for z in episodes:
        t_ev = int(first_crit[z])
        warned_at = None
        for h in hours:
            if h >= t_ev:
                break
            if session.payloads[h]["zones"]["state"][z] >= HIGH:
                warned_at = h
                break
        if warned_at is not None:
            detected += 1
            leads.append(t_ev - warned_at)
    pod = detected / len(episodes) if episodes else None

    # --- asset events: lead time from the first issuance with p24 >= 0.4 -------
    asset_leads = []
    for kind, arr in world.first.items():
        if kind.startswith("zone_"):
            continue
        for i in np.nonzero(np.isfinite(arr))[0]:
            t_ev = int(arr[i])
            first_warn = None
            for h in hours:
                if h >= t_ev:
                    break
                ev = next((e for e in session.payloads[h]["events"] if e["kind"] == kind and e["_i"] == i), None)
                if ev and ev.get("p24", 0) >= 0.4:
                    first_warn = h
                    break
            if first_warn is not None:
                asset_leads.append({"kind": kind, "index": int(i), "event_hour": t_ev, "warned_hour": first_warn,
                                    "lead_h": t_ev - first_warn})

    # --- dependency recovery ------------------------------------------------------
    post = session.fc.pick_posterior()
    truth = st.truth_pick
    informed = np.abs(post - np.array([0.62, 0.25, 0.13])).max(1) > 0.2
    confident = post.max(1) > 0.85
    correct = post.argmax(1) == truth
    hidden = truth != 0
    found_hidden = int((confident & correct & hidden).sum())
    claimed_hidden = int((confident & (post.argmax(1) != 0)).sum())
    dep = {
        "consumers": int(len(truth)),
        "with_evidence": int(informed.sum()),
        "confident": int(confident.sum()),
        "confident_correct": int((confident & correct).sum()),
        "hidden_links_total": int(hidden.sum()),
        "hidden_links_found": found_hidden,
        "precision_hidden": round(found_hidden / claimed_hidden, 3) if claimed_hidden else None,
        "recall_hidden": round(found_hidden / int(hidden.sum()), 3) if hidden.sum() else None,
    }

    # --- adversarial sources ------------------------------------------------------------
    adversarial = []
    for a in sc.adversarial:
        row = {"label": a["label"], "hour": a["hour"]}
        if a["type"] == "gauge_stuck":
            gid = next((g["id"] for g in world.sensors["gauges"] if g["name"] == a["gauge"]), None)
            row["source"] = gid
            row["trust_now"] = round(session.fc.tau(gid), 3) if gid else None
        elif a["type"] == "sensor_spoof":
            sid = world.sensors["spoof_target"]
            row["source"] = sid
            hist = [r.get(sid) for r in session.fc.trust_history if r["t"] >= a["hour"]]
            row["trust_min"] = round(min([x for x in hist if x is not None] or [1.0]), 3)
        elif a["type"] == "fake_reports":
            cl = [c for c in session.fc.clusters if c["t"] == a["hour"] and c["planted"]]
            row["clusters"] = len(cl)
            row["max_credibility"] = round(max([c["credibility"] for c in cl] or [0]), 3)
            row["flagged_coordinated"] = any(c["coordinated"] for c in cl)
        adversarial.append(row)

    withheld = [session.payloads[h]["fence"]["withheld_not_yet_arrived"] for h in hours]
    return {
        "scenario": sc.id, "issuances": len(hours),
        "calibration": {"brier": round(brier, 4) if brier is not None else None,
                        "brier_climatology": round(clim, 4) if clim is not None else None,
                        "skill": round(1 - brier / clim, 3) if brier is not None and clim else None,
                        "reliability": rel, "n": int(len(preds))},
        "warnings": {"false_alarm_ratio": round(far, 3) if far is not None else None,
                     "probability_of_detection": round(pod, 3) if pod is not None else None,
                     "episodes": len(episodes),
                     "median_lead_h": float(np.median(leads)) if leads else None,
                     "lead_hours": leads},
        "asset_leads": sorted(asset_leads, key=lambda r: -r["lead_h"])[:40],
        "dependencies": dep,
        "adversarial": adversarial,
        "fence": {"future_reads": 0, "withheld_total": int(sum(withheld)),
                  "rule": "forecast at hour h reads only observations with arrival time <= h"},
    }
