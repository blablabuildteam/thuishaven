/**
 * Curated mixseries / set channels — early “this set is flying” signal.
 * Channel IDs are public YouTube IDs (not secrets).
 *
 * Trim later: keep channels that feed the watchlist with bookable names.
 */
export type MixseriesChannel = {
  key: string;
  title: string;
  youtubeChannelId: string;
  /** Min views for a “viral” alert on first sight / growth. */
  viralViews: number;
  /** Min view growth vs previous snapshot for velocity alert. */
  viralGrowthRatio: number;
};

export const RADAR_MIXSERIES_CHANNELS: MixseriesChannel[] = [
  // —— Live / set culture (early breakout) ——
  {
    key: "boiler_room",
    title: "Boiler Room",
    youtubeChannelId: "UCGBpxWJr9FNOcFYA5GkKrMg",
    viralViews: 80_000,
    viralGrowthRatio: 1.8,
  },
  {
    key: "hor",
    title: "HÖR Berlin",
    youtubeChannelId: "UCmfF7JZv26UUKyRedViGIlw",
    viralViews: 40_000,
    viralGrowthRatio: 1.7,
  },
  {
    key: "cercle",
    title: "Cercle",
    youtubeChannelId: "UCPKT_csvhyUmeYrH5_Hfa1Q",
    viralViews: 100_000,
    viralGrowthRatio: 1.6,
  },
  {
    key: "dekmantel",
    title: "Dekmantel",
    youtubeChannelId: "UCtUI3CJsQazs3WAaEE3ce9w",
    viralViews: 20_000,
    viralGrowthRatio: 1.6,
  },
  // —— Radio / discovery platforms ——
  {
    key: "nts",
    title: "NTS Radio",
    youtubeChannelId: "UCmqKuYoZCI7D6FQzDv5nKNw",
    viralViews: 25_000,
    viralGrowthRatio: 1.7,
  },
  {
    key: "rinse",
    title: "Rinse FM",
    youtubeChannelId: "UCgGfSxNOBkJDtCQ932iQU7Q",
    viralViews: 25_000,
    viralGrowthRatio: 1.7,
  },
  {
    key: "triple_j",
    title: "triple j",
    youtubeChannelId: "UCd2KNtfphz8HvYzM4pwtHmg",
    viralViews: 40_000,
    viralGrowthRatio: 1.7,
  },
  // —— Magazines / industry ——
  {
    key: "mixmag",
    title: "Mixmag",
    youtubeChannelId: "UCQdCIrTpkhEH5Z8KPsn7NvQ",
    viralViews: 50_000,
    viralGrowthRatio: 1.7,
  },
  {
    key: "djmag",
    title: "DJ Mag",
    youtubeChannelId: "UCJEKlziKdxoos1qbptjGgLg",
    viralViews: 40_000,
    viralGrowthRatio: 1.6,
  },
  {
    key: "resident_advisor",
    title: "Resident Advisor",
    youtubeChannelId: "UCDHvlud7Hf86FxFsogrBcMg",
    viralViews: 30_000,
    viralGrowthRatio: 1.6,
  },
  // —— Labels with strong set / artist video culture ——
  {
    key: "innervisions",
    title: "Innervisions",
    youtubeChannelId: "UCC7eKMxcVk1LZwzJlBdsVuQ",
    viralViews: 20_000,
    viralGrowthRatio: 1.6,
  },
];
