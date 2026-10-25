"use client";

import { useCallback, useRef, useState } from "react";

/** Element size via a callback ref, so it keeps working when the element
 * mounts after the first render (e.g. behind a loading state). */
export function useSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ width: Math.round(r.width), height: Math.round(r.height) });
    });
    ro.observe(node);
    observer.current = ro;
  }, []);
  return [ref, size] as const;
}
