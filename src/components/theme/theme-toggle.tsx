"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
  compact?: boolean;
};

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Schakel naar light theme" : "Schakel naar dark theme"}
      title={isDark ? "Light" : "Dark"}
      className={cn(
        "inline-flex items-center gap-2 border border-border bg-surface px-2.5 py-1.5 text-text-muted transition-colors hover:border-border-strong hover:text-text",
        className,
      )}
    >
      {isDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      {!compact && (
        <span className="font-display text-sm tracking-[0.12em]">
          {isDark ? "Light" : "Dark"}
        </span>
      )}
    </button>
  );
}
