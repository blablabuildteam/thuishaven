import { PaidAdsComingSoon } from "@/components/dashboard/paid-ads-coming-soon";

export const metadata = { title: "Marketing (paid) · YouTube" };
export const dynamic = "force-dynamic";

export default function PaidYouTubePage() {
  return <PaidAdsComingSoon title="YouTube ads" channelLabel="YouTube ads" />;
}
