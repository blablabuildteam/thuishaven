import { NextResponse } from "next/server";
import {
  PIPELINE_STAGES,
  runOutreachDryRun,
} from "@/lib/outreach/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    stages: PIPELINE_STAGES,
  });
}

export async function POST() {
  const result = await runOutreachDryRun();
  return NextResponse.json(result);
}
