/** Point symbols drawn in survey-map notation: one stroke weight, ink only.
 * Each returns an SVG string so deck.gl can pack them into an icon atlas. */

const INK = "#15171a";
const PAPER = "#fafaf7";
const S = 32;

function svg(body: string, size = S) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
}

export const SYMBOL_SVG: Record<string, string> = {
  hospital: svg(`<rect x="5" y="5" width="22" height="22" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><path d="M16 10v12M10 16h12" stroke="${INK}" stroke-width="3"/>`),
  substation: svg(`<path d="M16 4 L29 27 H3 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 11 l-4 8 h5 l-3 6" fill="none" stroke="${INK}" stroke-width="2"/>`),
  pump: svg(`<circle cx="16" cy="16" r="11" fill="${PAPER}" stroke="#2c78b5" stroke-width="2.5"/><circle cx="16" cy="16" r="4" fill="#2c78b5"/>`),
  tower: svg(`<path d="M8 27 L16 5 L24 27 M11 19 h10" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`),
  metro: svg(`<rect x="5" y="8" width="22" height="16" rx="3" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><path d="M10 20 V12 l6 5 6-5 v8" fill="none" stroke="${INK}" stroke-width="2"/>`),
  underpass: svg(`<path d="M8 6 C14 12 14 20 8 26 M24 6 C18 12 18 20 24 26" fill="none" stroke="${INK}" stroke-width="2.8"/>`),
  fire_station: svg(`<path d="M16 3 L29 16 L16 29 L3 16 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/><path d="M11 16 h10" stroke="${INK}" stroke-width="2.6"/>`),
  water: svg(`<path d="M16 4 C10 13 8 17 8 20 a8 8 0 0 0 16 0 c0-3-2-7-8-16z" fill="${PAPER}" stroke="#2c78b5" stroke-width="2.4"/>`),
  lake: svg(`<path d="M5 13 q5.5-5 11 0 t11 0 M5 21 q5.5-5 11 0 t11 0" fill="none" stroke="#2c78b5" stroke-width="2.6"/>`),
  shelter: svg(`<path d="M5 15 L16 5 L27 15 V27 H5 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.3" stroke-linejoin="round"/>`),
  fuel: svg(`<rect x="8" y="7" width="12" height="20" fill="${PAPER}" stroke="${INK}" stroke-width="2.2"/><path d="M20 12 h4 v10" fill="none" stroke="${INK}" stroke-width="2"/>`),
};

/** Orienteering course marks in the reserved overprint colour. */
export const COURSE_SVG = {
  start: svg(`<path d="M16 3 L29 27 H3 Z" fill="none" stroke="#8e2a8b" stroke-width="3" stroke-linejoin="round"/>`, 32),
  finish: svg(`<circle cx="16" cy="16" r="13" fill="none" stroke="#8e2a8b" stroke-width="2.6"/><circle cx="16" cy="16" r="8" fill="none" stroke="#8e2a8b" stroke-width="2.6"/>`, 32),
};

export function dataUrl(s: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`;
}

export const ASSET_LABEL: Record<string, string> = {
  hospital: "Hospital",
  substation: "Substation",
  pump: "Stormwater pump",
  tower: "Mobile site",
  metro: "Metro station",
  underpass: "Underpass",
  fire_station: "Ambulance / fire base",
  water: "Water works",
  lake: "Lake & spillway",
  shelter: "Shelter",
  fuel: "Fuel station",
};
