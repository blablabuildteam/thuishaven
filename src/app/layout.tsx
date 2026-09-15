import type { Metadata } from "next";
import {
  Barlow_Condensed,
  Raleway,
  IBM_Plex_Mono,
} from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthSessionProvider } from "@/components/auth/session-provider";
import "./globals.css";

/** Match thuishaven.nl: Barlow Condensed (display) + Raleway (body) */
const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const sans = Raleway({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const themeCookie = (await cookies()).get("th-theme")?.value;
  const theme = themeCookie === "dark" ? "dark" : "light";

  return (
    <html
      lang="nl"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased${theme === "dark" ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-bg font-sans text-text">
        <AuthSessionProvider>
          <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
