import { NextResponse } from "next/server";
import {
  listIntegrationStatusSnapshot,
  probeConfiguredIntegrations,
} from "@/lib/integrations/verify";
import { INTEGRATIONS } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/integrations/status
 * ?probe=1 — live-check geconfigureerde koppelingen (geverifieerd / fout)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";

  const snapshot = listIntegrationStatusSnapshot();
  let probes: Awaited<ReturnType<typeof probeConfiguredIntegrations>> = [];

  if (probe) {
    probes = await probeConfiguredIntegrations();
  }

  const probeById = Object.fromEntries(probes.map((p) => [p.id, p]));

  const integrations = snapshot.map((row) => {
    const live = probeById[row.id];
    return {
      ...row,
      status: live?.status ?? row.status,
      message: live?.message,
      checkedAt: live?.checkedAt,
    };
  });

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    probed: probe,
    integrations,
    catalog: INTEGRATIONS.map((i) => ({
      id: i.id,
      name: i.name,
      tool: i.tool,
      priority: i.priority,
      description: i.description,
      askFromClient: i.askFromClient,
      verifyHint: i.verifyHint,
      docsUrl: i.docsUrl,
      envKeys: i.envKeys,
      optionalEnvKeys: i.optionalEnvKeys ?? [],
    })),
  });
}
