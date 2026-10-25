"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "./bits";

export const MapClient = dynamic(() => import("@/components/atlas/AtlasMap").then((m) => m.AtlasMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});
