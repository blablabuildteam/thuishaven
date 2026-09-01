"use client";

import { useState } from "react";
import { Heart, MessageCircle, Play, Share2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MarketingPostRow } from "@/lib/marketing/posts";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type Props = {
  post: MarketingPostRow;
  /** Aspect class for the media plane. */
  aspectClass?: string;
};

function isVideoFormat(format: string | undefined): boolean {
  if (!format) return false;
  return /video|reel|short|vertical/i.test(format);
}

function youtubeEmbedUrl(externalId: string | null): string | null {
  if (!externalId) return null;
  return `https://www.youtube.com/embed/${encodeURIComponent(externalId)}?autoplay=1&rel=0`;
}

function tiktokEmbedUrl(externalId: string | null): string | null {
  if (!externalId) return null;
  return `https://www.tiktok.com/embed/v2/${encodeURIComponent(externalId)}`;
}

export function SocialPostCard({
  post,
  aspectClass = "aspect-square",
}: Props) {
  const [playing, setPlaying] = useState(false);
  const img = post.storedMediaUrl || post.thumbnailUrl || post.mediaUrl;
  const vf = post.visualFeatures;
  const format = vf?.format;
  const videoLike =
    Boolean(post.videoUrl) ||
    isVideoFormat(format) ||
    post.channel === "tiktok" ||
    post.channel === "youtube";

  const embedSrc =
    post.channel === "youtube"
      ? youtubeEmbedUrl(post.externalId)
      : post.channel === "tiktok"
        ? tiktokEmbedUrl(post.externalId)
        : null;

  const canPlay = Boolean(post.videoUrl) || Boolean(embedSrc);

  const viewsLabel =
    post.channel === "instagram"
      ? post.impressions > 0
        ? `${formatNumber(post.impressions)} views`
        : post.reach > 0
          ? `${formatNumber(post.reach)} reach`
          : null
      : post.impressions > 0
        ? `${formatNumber(post.impressions)} views`
        : null;

  return (
    <li className="overflow-hidden border border-border bg-surface">
      <div className={cn("relative bg-bg-elevated", aspectClass)}>
        {playing && post.videoUrl ? (
          <video
            className="absolute inset-0 size-full object-cover"
            src={post.videoUrl}
            poster={img ?? undefined}
            controls
            autoPlay
            playsInline
          />
        ) : playing && embedSrc ? (
          <iframe
            title={post.title || "Video"}
            src={embedSrc}
            className="absolute inset-0 size-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={img ? { backgroundImage: `url(${img})` } : undefined}
            />
            {canPlay && (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/25 text-white transition hover:bg-black/35"
                aria-label="Video afspelen"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-black/55">
                  <Play className="size-5 fill-current" aria-hidden />
                </span>
              </button>
            )}
          </>
        )}
      </div>

      <div className="p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone="neutral">{format ?? post.channel}</StatusBadge>
          {vf?.offer && <StatusBadge tone="accent">{vf.offer}</StatusBadge>}
          <time
            dateTime={post.publishedAt ?? undefined}
            className="ml-auto text-[11px] text-text-dim"
          >
            {formatDate(post.publishedAt)}
          </time>
        </div>

        <p className="mt-2 line-clamp-2 text-sm font-medium">
          {post.title || "Zonder titel"}
        </p>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
          {viewsLabel && <span>{viewsLabel}</span>}
          {post.likeCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3" aria-hidden />
              {formatNumber(post.likeCount)}
            </span>
          )}
          {post.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3" aria-hidden />
              {formatNumber(post.commentCount)}
            </span>
          )}
          {post.shareCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Share2 className="size-3" aria-hidden />
              {formatNumber(post.shareCount)}
            </span>
          )}
          {post.likeCount === 0 &&
            post.commentCount === 0 &&
            post.engagement > 0 && (
              <span>{formatNumber(post.engagement)} eng.</span>
            )}
        </div>

        {post.ticketLift?.signal === "measured" && (
          <p className="mt-1 text-xs text-text-dim">
            +{formatNumber(post.ticketLift.sold ?? 0)} tickets ±48u
          </p>
        )}

        {videoLike && !canPlay && post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-2"
          >
            <Play className="size-3" aria-hidden />
            Open video
          </a>
        ) : post.permalink ? (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs underline underline-offset-2"
          >
            Open post
          </a>
        ) : null}
      </div>
    </li>
  );
}
