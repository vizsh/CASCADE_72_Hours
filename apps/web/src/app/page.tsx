import { HomeHero, HomeProof, HomeScenarios } from "@/components/site/HomeSections";
import { SiteFooter, SiteHeader } from "@/components/site/SiteChrome";

const LEVELS = [
  {
    q: "What physical event is coming?",
    title: "Hazard",
    body: "Ensemble weather, heat, plumes, crowds and grid faults, carried as many possible futures rather than one line.",
    eg: "Most members put a cloudburst over the city before dawn on 23 September; some miss it entirely.",
  },
  {
    q: "What does it touch?",
    title: "Exposure",
    body: "Real terrain and drainage decide where water collects; real roads, substations, hospitals and people decide what sits in it.",
    eg: "Low ground below Ambazari Lake, ring-road underpasses, dense old neighbourhoods by the Nag.",
  },
  {
    q: "What fails next, when?",
    title: "Cascade",
    body: "Failures propagate through a dependency network the system partly learns from data. Each leg has a mechanism, a lag and a probability.",
    eg: "Lake overflow → flooded underpass → ambulance delay → hospital over capacity.",
  },
  {
    q: "What can we do before the window closes?",
    title: "Intervention",
    body: "Actions run on the same simulated futures as doing nothing, so you see what breaks, what it costs elsewhere, and the deadline to start.",
    eg: "Mobile pumps, staged ambulances and early underpass closures, compared on the same futures.",
  },
];

export default function Home() {
  return (
    <div className="bg-paper">
      <SiteHeader />
      <main>
        <HomeHero />

        <section id="how" className="border-t border-rule">
          <div className="mx-auto max-w-[1320px] px-5 py-16">
            <h2 className="max-w-2xl text-[34px] font-extrabold leading-[1.05] tracking-tight wdth-condensed">
              One question, asked four ways, every hour.
            </h2>
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-2">
              What is likely to fail next, what will that failure affect, and what can we do now to stop the cascade? Each layer feeds the next; new evidence re-runs
              all four.
            </p>
            <ol className="mt-10 grid border-t-2 border-ink md:grid-cols-4">
              {LEVELS.map((l, i) => (
                <li key={l.title} className="relative border-b border-rule py-6 md:border-r md:border-b-0 md:px-6 md:first:pl-0 md:last:border-r-0">
                  <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-course">
                    Layer {i + 1} · {l.title}
                  </div>
                  <h3 className="mt-2 text-[19px] font-bold leading-snug">{l.q}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{l.body}</p>
                  <p className="mt-3 border-l-2 border-course pl-3 text-[13px] leading-snug text-ink-3">{l.eg}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <HomeScenarios />
        <HomeProof />

        <section className="border-t border-rule">
          <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-16 md:grid-cols-[1fr_1fr]">
            <div>
              <h2 className="text-[30px] font-extrabold leading-[1.05] tracking-tight wdth-condensed">Honest about what is real.</h2>
              <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-2">
                No Indian city publishes live bed counts, feeder status and ambulance traces. So the forecaster is tested against a hidden world model that it never
                sees, running on real geography.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-6 text-[14px]">
              <div>
                <div className="mb-2 font-bold">Real</div>
                <ul className="space-y-1.5 text-ink-2">
                  <li>Roads, hospitals, substations, underpasses, lakes, metro (OpenStreetMap)</li>
                  <li>Terrain and drainage lines (Copernicus elevation)</li>
                  <li>Live 31-member weather ensembles (Open-Meteo)</li>
                  <li>Storm timing and totals for the 2023 replay (IMD-reported)</li>
                </ul>
              </div>
              <div>
                <div className="mb-2 font-bold">Simulated, labelled</div>
                <ul className="space-y-1.5 text-ink-2">
                  <li>Drain, feeder, tower, hospital and ambulance telemetry</li>
                  <li>Which substation feeds which hospital (hidden from the forecaster)</li>
                  <li>Citizen reports, including planted false ones</li>
                  <li>Mobile sites and stormwater pumps where no registry is open</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
