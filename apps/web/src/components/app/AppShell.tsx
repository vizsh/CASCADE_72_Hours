"use client";

import { Activity, FlaskConical, GitBranch, History, Map as MapIcon, Radio, Smartphone, Clock3 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { STATES } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { StateChip } from "./bits";
import { useScenario } from "./ScenarioProvider";
import { TimeCursor } from "./TimeCursor";

const NAV = [
  { group: "Respond · 0–6 h", items: [{ href: "", label: "Command", icon: MapIcon }] },
  {
    group: "Prepare · 6–24 h",
    items: [
      { href: "/explore", label: "Explore cascade", icon: GitBranch },
      { href: "/lab", label: "Intervention lab", icon: FlaskConical },
    ],
  },
  { group: "Plan · 24–72 h", items: [{ href: "/timeline", label: "72-hour clock", icon: Clock3 }] },
  {
    group: "Learn",
    items: [
      { href: "/evidence", label: "Evidence & signals", icon: Radio },
      { href: "/replay", label: "Replay & validation", icon: History },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { sid, scenario, scenarios, payload, city } = useScenario();
  const path = usePathname();
  const router = useRouter();
  const base = `/app/${sid}`;
  const r0 = payload?.cascade_r?.[0] ?? 0;
  const rPeak = payload ? Math.max(...payload.cascade_r) : 0;

  return (
    <div className="grid h-dvh grid-cols-[208px_1fr] grid-rows-[52px_1fr_auto] overflow-hidden bg-paper">
      <header className="col-span-2 flex items-center gap-4 border-b border-rule bg-paper-raised px-4">
        <Link href="/" className="flex items-center gap-2 pr-2" aria-label="CASCADE 72 home">
          <Mark />
          <span className="text-[15px] font-extrabold tracking-tight wdth-condensed">CASCADE&nbsp;72</span>
        </Link>
        <div className="h-6 w-px bg-rule" />
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Scenario</span>
          <select
            value={sid}
            onChange={(e) => router.push(`/app/${e.target.value}${path.replace(base, "")}`)}
            className="max-w-[280px] truncate rounded-sm border border-rule-strong bg-paper-raised px-2 py-1 text-sm font-semibold"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <span className="hidden text-ink-3 lg:inline">{city?.name}</span>
        </label>
        <div className="ml-auto flex items-center gap-5">
          {payload ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">City</span>
                <StateChip state={payload.city_state} />
              </div>
              <div className="flex items-baseline gap-1.5" title="Propagated failures in the next 3 h per failure in the last 3 h">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Cascade-R</span>
                <span className={cn("text-lg font-bold tabular", r0 >= 1 ? "text-critical-ink" : "text-ink")}>{r0.toFixed(2)}</span>
                <span className="text-xs text-ink-3 tabular">peak {rPeak.toFixed(2)}</span>
              </div>
              <div className="hidden text-right text-xs leading-tight xl:block">
                <div className="font-semibold">Issued {new Date(payload.time).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</div>
                <div className="text-ink-3">{payload.fence.observations_used.toLocaleString()} observations · 0 from the future</div>
              </div>
            </>
          ) : null}
        </div>
      </header>

      <nav className="row-span-1 flex flex-col gap-5 overflow-y-auto border-r border-rule bg-paper-raised px-3 py-4" aria-label="Operator views">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1.5 px-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const href = `${base}${it.href}`;
                const active = it.href === "" ? path === base : path.startsWith(href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-paper-sunk",
                        active && "bg-ink text-paper-raised hover:bg-ink",
                      )}
                    >
                      <Icon size={15} strokeWidth={2} />
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="mt-auto space-y-0.5 border-t border-rule pt-3">
          <Link href="/live" className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13.5px] font-medium text-ink-2 hover:bg-paper-sunk">
            <Activity size={15} /> Live: today
          </Link>
          <Link href="/my-area" className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13.5px] font-medium text-ink-2 hover:bg-paper-sunk">
            <Smartphone size={15} /> Citizen view
          </Link>
          {scenario ? (
            <p className="px-2 pt-2 text-[11px] leading-snug text-ink-3">
              {scenario.provenance.telemetry ?? scenario.provenance.all ?? ""}
            </p>
          ) : null}
        </div>
      </nav>

      <main className="relative min-h-0 overflow-hidden">{children}</main>
      <div className="col-span-2">
        <TimeCursor />
      </div>
      <span className="sr-only" aria-live="polite">
        {payload ? `City ${STATES[payload.city_state]}, Cascade-R ${r0.toFixed(2)}` : ""}
      </span>
    </div>
  );
}

export function Mark({ size = 22 }: { size?: number }) {
  // a start triangle and two controls: the product's own course
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 3 L9.5 11 H0.5 Z" fill="none" stroke="var(--course)" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 10 L16 12.5 M18.5 15 L19 20" stroke="var(--course)" strokeWidth="1.6" />
      <circle cx="18" cy="13" r="3.2" fill="none" stroke="var(--course)" strokeWidth="1.8" />
      <circle cx="19.2" cy="21" r="2.2" fill="var(--course)" />
    </svg>
  );
}
