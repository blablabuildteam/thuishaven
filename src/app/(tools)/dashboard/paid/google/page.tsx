import { PaidAdsComingSoon } from "@/components/dashboard/paid-ads-coming-soon";

export const metadata = { title: "Marketing (paid) · Google Ads" };
export const dynamic = "force-dynamic";

export default function PaidGooglePage() {
  return <PaidAdsComingSoon title="Google Ads" channelLabel="Google Ads" />;
}
