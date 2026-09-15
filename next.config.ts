import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },
  experimental: {
    // Default dynamic staleTime is 0, so leaving a page and coming back
    // always re-fetches RSC. Keep recently visited dashboard views for 60s.
    staleTimes: {
      dynamic: 60,
      static: 180,
    },
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard/inzichten",
        permanent: false,
      },
      {
        source: "/dashboard",
        destination: "/dashboard/inzichten",
        permanent: false,
      },
      {
        source: "/dashboard/weeztix",
        destination: "/dashboard/tickets",
        permanent: true,
      },
      {
        source: "/dashboard/weeztix/:editionId",
        destination: "/dashboard/tickets/:editionId",
        permanent: true,
      },
      {
        source: "/dashboard/dashboards",
        destination: "/dashboard/inzichten",
        permanent: true,
      },
      {
        source: "/dashboard/insights",
        destination: "/dashboard/inzichten",
        permanent: true,
      },
      {
        source: "/dashboard/marketing",
        destination: "/dashboard/mails",
        permanent: true,
      },
      {
        source: "/dashboard/paid",
        destination: "/dashboard/paid/meta",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
