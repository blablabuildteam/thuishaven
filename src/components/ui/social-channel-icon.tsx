import Image from "next/image";
import { cn } from "@/lib/utils";

export type SocialBrandChannel =
  | "instagram"
  | "meta"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "google_ads"
  | "mail"
  | "brevo"
  | "email";

const ICON_SRC: Record<SocialBrandChannel, string> = {
  instagram: "/social-icons/insta.webp",
  meta: "/social-icons/insta.webp",
  facebook: "/social-icons/insta.webp",
  tiktok: "/social-icons/tiktok.png",
  youtube: "/social-icons/youtube.png",
  google_ads: "/social-icons/google-ads.png",
  mail: "/social-icons/mail.png",
  brevo: "/social-icons/mail.png",
  email: "/social-icons/mail.png",
};

const ICON_ALT: Record<SocialBrandChannel, string> = {
  instagram: "Instagram",
  meta: "Meta",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  google_ads: "Google Ads",
  mail: "Mail",
  brevo: "Brevo",
  email: "E-mail",
};

export function resolveSocialBrandChannel(
  channel: string | null | undefined,
): SocialBrandChannel | null {
  if (!channel) return null;
  const key = channel.toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (key === "google" || key === "googleads") return "google_ads";
  if (key in ICON_SRC) return key as SocialBrandChannel;
  return null;
}

export function socialBrandIconSrc(
  channel: string | null | undefined,
): string | null {
  const resolved = resolveSocialBrandChannel(channel);
  return resolved ? ICON_SRC[resolved] : null;
}

/** Brand mark for a paid-ad platform row (Meta → Instagram icon). */
export function paidAdBrandChannel(
  platform: string | null | undefined,
): SocialBrandChannel {
  const resolved = resolveSocialBrandChannel(platform);
  if (resolved && resolved !== "mail" && resolved !== "brevo" && resolved !== "email") {
    return resolved;
  }
  return "instagram";
}

/** Brand mark from `/public/social-icons` for IG / TikTok / YouTube / mail. */
export function SocialChannelIcon({
  channel,
  size = 16,
  className,
  alt,
  paid = false,
}: {
  channel: string;
  size?: number;
  className?: string;
  alt?: string;
  paid?: boolean;
}) {
  const resolved = resolveSocialBrandChannel(channel);
  if (!resolved) return null;

  const icon = (
    <Image
      src={ICON_SRC[resolved]}
      alt={alt ?? ICON_ALT[resolved]}
      width={paid ? Math.max(8, size - 2) : size}
      height={paid ? Math.max(8, size - 2) : size}
      className={cn(
        "shrink-0 object-contain",
        paid && "brightness-0 invert",
        !paid && className,
      )}
      unoptimized
    />
  );

  if (!paid) return icon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-success",
        className,
      )}
      style={{ width: size + 4, height: size + 4 }}
      title={alt ?? `${ICON_ALT[resolved]} paid`}
    >
      {icon}
    </span>
  );
}
