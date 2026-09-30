export type TemplateStat = {
  variantKey: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  openRate: number;
  replyRate: number;
};

/** Below this many sends a rate is noise. */
export const TEMPLATE_STATS_MIN_SENT = 10;

export function formatTemplateStat(s: TemplateStat | undefined): string {
  if (!s || s.sent === 0) return "nog niet verstuurd";
  const base = `${s.sent}× · ${Math.round(s.openRate)}% open · ${Math.round(s.replyRate)}% reply`;
  return s.sent < TEMPLATE_STATS_MIN_SENT ? `${base} (weinig data)` : base;
}

/** Best reply rate among templates with enough data, else null. */
export function bestTemplateKey(stats: Record<string, TemplateStat>): string | null {
  const eligible = Object.values(stats).filter(
    (s) => s.sent >= TEMPLATE_STATS_MIN_SENT,
  );
  if (eligible.length < 2) return null;
  return eligible.sort((a, b) => b.replyRate - a.replyRate || b.openRate - a.openRate)[0]!
    .variantKey;
}
