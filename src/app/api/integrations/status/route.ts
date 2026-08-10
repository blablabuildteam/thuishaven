import { NextResponse } from "next/server";
import {
  listIntegrationStatusSnapshot,
} from "@/lib/integrations/verify";
import { INTEGRATIONS, MEETING_INPUTS } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    integrations: listIntegrationStatusSnapshot(),
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
    meetingInputs: MEETING_INPUTS,
  });
}
