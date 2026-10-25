import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { ScenarioProvider } from "@/components/app/ScenarioProvider";

export default function ScenarioLayout({ children, params }: LayoutProps<"/app/[scenario]">) {
  return (
    <Suspense fallback={<div className="h-dvh bg-paper" />}>
      {params.then(({ scenario }) => (
        <ScenarioProvider sid={scenario}>
          <AppShell>{children}</AppShell>
        </ScenarioProvider>
      ))}
    </Suspense>
  );
}
