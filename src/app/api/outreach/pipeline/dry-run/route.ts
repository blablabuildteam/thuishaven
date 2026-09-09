import { NextResponse } from "next/server";
import {
  getLivePipelineStages,
  runOutreachDryRun,
} from "@/lib/outreach/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    stages: getLivePipelineStages(),
  });
}

export async function POST() {
  const result = await runOutreachDryRun();
  return NextResponse.json(result);
}
