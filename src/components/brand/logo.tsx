import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string;
  showWordmark?: boolean;
  showMark?: boolean;
  markSize?: number;
  className?: string;
  wordmarkClassName?: string;
};

export function BrandLogo({
  href = "/",
  showWordmark = true,
  showMark = true,
  markSize = 36,
  className,
  wordmarkClassName,
}: BrandLogoProps) {
  const content = (
    <span className={cn("inline-flex items-center gap-3", className)}>
      {showMark && (
        <Image
          src="/brand/logo-mark.png"
          alt=""
          width={markSize}
          height={markSize}
          className="shrink-0 object-contain"
          priority
        />
      )}
      {showWordmark && (
        <span
          className={cn(
            "font-display text-2xl leading-none tracking-[0.04em] text-text",
            wordmarkClassName,
          )}
        >
          Thuishaven
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} className="group inline-flex transition-opacity hover:opacity-90">
      {content}
    </Link>
  );
}
