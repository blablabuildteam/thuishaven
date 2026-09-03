import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root,
  },
  async redirects() {
    return [
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
    ];
  },
};

export default nextConfig;
