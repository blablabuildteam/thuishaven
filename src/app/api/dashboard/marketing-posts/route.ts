import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  isSocialRange,
  loadMarketingPostsPage,
  type SocialFeedChannel,
} from "@/lib/marketing/posts";

export const dynamic = "force-dynamic";

const CHANNELS = new Set<SocialFeedChannel>([
  "instagram",
  "tiktok",
  "youtube",
]);

/** GET /api/dashboard/marketing-posts?channel=&cursor=&limit=&range= */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const url = new URL(request.url);
  const channelRaw = url.searchParams.get("channel");
  if (!channelRaw || !CHANNELS.has(channelRaw as SocialFeedChannel)) {
    return NextResponse.json(
      { error: "channel moet youtube, tiktok of instagram zijn" },
      { status: 400 },
    );
  }

  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    return NextResponse.json({ error: "Ongeldige limit" }, { status: 400 });
  }

  const rangeRaw = url.searchParams.get("range");
  if (rangeRaw && !isSocialRange(rangeRaw)) {
    return NextResponse.json(
      { error: "range moet 30d, 3m, 6m of 1y zijn" },
      { status: 400 },
    );
  }

  const page = await loadMarketingPostsPage({
    channel: channelRaw as SocialFeedChannel,
    cursor: url.searchParams.get("cursor"),
    limit,
    range: rangeRaw && isSocialRange(rangeRaw) ? rangeRaw : undefined,
    withLift: true,
  });

  return NextResponse.json(page);
}
