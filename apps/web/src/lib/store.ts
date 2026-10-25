"use client";

import { create } from "zustand";

export type Selection =
  | { type: "event"; id: string }
  | { type: "zone"; id: string }
  | { type: "asset"; id: string }
  | null;

export type MapMetric = "state" | "p_crit24" | "p_high72" | "truth";

type Store = {
  hour: number | null;
  setHour: (h: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  selection: Selection;
  select: (s: Selection) => void;
  hover: string | null;
  setHover: (id: string | null) => void;
  metric: MapMetric;
  setMetric: (m: MapMetric) => void;
  layers: { assets: boolean; course: boolean; contours: boolean; roads: boolean };
  toggleLayer: (k: keyof Store["layers"]) => void;
};

export const useStore = create<Store>((set) => ({
  hour: null,
  setHour: (hour) => set({ hour }),
  playing: false,
  setPlaying: (playing) => set({ playing }),
  selection: null,
  select: (selection) => set({ selection }),
  hover: null,
  setHover: (hover) => set({ hover }),
  metric: "state",
  setMetric: (metric) => set({ metric }),
  layers: { assets: true, course: true, contours: true, roads: true },
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
}));
