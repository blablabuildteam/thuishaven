import { PrefetchOutreachNav } from "@/components/outreach/prefetch-outreach-nav";

export default function OutreachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PrefetchOutreachNav />
      {children}
    </>
  );
}
