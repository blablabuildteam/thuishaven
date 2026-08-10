import type { Metadata } from "next";
import {
  Barlow_Condensed,
  Raleway,
  IBM_Plex_Mono,
} from "next/font/google";
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

const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem('th-theme');
    if (t === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="nl"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full bg-bg font-sans text-text">
        <AuthSessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
