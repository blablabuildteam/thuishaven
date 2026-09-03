import Image from "next/image";
import { cn } from "@/lib/utils";

export type SocialBrandChannel =
  | "instagram"
  | "meta"
  | "facebook"
  | "tiktok"
  | "youtube"
  | "mail"
  | "brevo"
  | "email";

const ICON_SRC: Record<SocialBrandChannel, string> = {
  instagram: "/social-icons/insta.webp",
  meta: "/social-icons/insta.webp",
  facebook: "/social-icons/insta.webp",
  tiktok: "/social-icons/tiktok.png",
  youtube: "/social-icons/youtube.png",
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
  mail: "Mail",
  brevo: "Brevo",
  email: "E-mail",
};

export function resolveSocialBrandChannel(
  channel: string | null | undefined,
): SocialBrandChannel | null {
  if (!channel) return null;
  const key = channel.toLowerCase().trim();
  if (key in ICON_SRC) return key as SocialBrandChannel;
  return null;
}

export function socialBrandIconSrc(
  channel: string | null | undefined,
): string | null {
  const resolved = resolveSocialBrandChannel(channel);
  return resolved ? ICON_SRC[resolved] : null;
}

/** Brand mark from `/public/social-icons` for IG / TikTok / YouTube / mail. */
export function SocialChannelIcon({
  channel,
  size = 16,
  className,
  alt,
}: {
  channel: string;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const resolved = resolveSocialBrandChannel(channel);
  if (!resolved) return null;

  return (
    <Image
      src={ICON_SRC[resolved]}
      alt={alt ?? ICON_ALT[resolved]}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      unoptimized
    />
  );
}
