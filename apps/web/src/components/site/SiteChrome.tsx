import Link from "next/link";
import { Mark } from "@/components/app/AppShell";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#scenarios", label: "Scenarios" },
  { href: "/#proof", label: "Validation" },
  { href: "/live", label: "Live today" },
  { href: "/my-area", label: "Citizen view" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-rule bg-paper/92 backdrop-blur-[3px]">
      <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2" aria-label="CASCADE 72 home">
          <Mark />
          <span className="text-[16px] font-extrabold tracking-tight wdth-condensed">CASCADE&nbsp;72</span>
        </Link>
        <nav className="hidden items-center gap-5 text-[13.5px] font-medium text-ink-2 md:flex" aria-label="Site">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link href="/app/monsoon-2023" className="ml-auto rounded-sm bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-paper-raised hover:bg-ink-2">
          Open the operations room
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-rule bg-paper-raised">
      <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-10 text-[12.5px] text-ink-3 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-ink">
            <Mark size={18} />
            <span className="font-extrabold wdth-condensed">CASCADE 72</span>
          </div>
          <p className="mt-2 max-w-xs leading-relaxed">
            Built in 24 hours for CASCADE &rsquo;26 (Theme 2 · The 72-Hour Warning) at IIIT Nagpur. Decision support only: it proposes, people decide.
          </p>
        </div>
        <div className="leading-relaxed">
          <div className="font-semibold text-ink">Data</div>
          Roads, facilities, rivers and lakes © OpenStreetMap contributors (ODbL). Elevation: Copernicus DEM via Open-Meteo. Live weather: GFS ensemble via Open-Meteo.
          City telemetry in replays is simulated and labelled as such.
        </div>
        <div className="leading-relaxed">
          <div className="font-semibold text-ink">Source</div>
          <a className="underline hover:text-ink" href="https://github.com/vizsh/CASCADE_72_Hours">github.com/vizsh/CASCADE_72_Hours</a>
          <p className="mt-2">Free and open-source stack: Next.js, MapLibre, deck.gl, FastAPI, NumPy.</p>
        </div>
      </div>
    </footer>
  );
}
