import type { Metadata } from "next";
import { Archivo, Mukta } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const mukta = Mukta({
  variable: "--font-mukta",
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CASCADE 72: what fails next",
    template: "%s · CASCADE 72",
  },
  description:
    "Consequence-first urban crisis forecasting. Predicts how one disruption propagates across a city's drainage, roads, power, telecom and hospitals up to 72 hours ahead, and what to do before the window closes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${mukta.variable} h-full`}>
      <body className="min-h-full bg-paper text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
