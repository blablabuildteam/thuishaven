import type { Metadata } from "next";
import { Bebas_Neue, Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Bebas_Neue({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Thuishaven Tools",
    template: "%s · Thuishaven Tools",
  },
  description:
    "Marketing- & Kaartverkoop Dashboard en Bedrijfsevent Outreach voor Thuishaven.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-bg font-sans text-text">{children}</body>
    </html>
  );
}
