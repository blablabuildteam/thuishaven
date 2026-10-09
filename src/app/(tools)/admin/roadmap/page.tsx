import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Roadmap · Admin" };

type Item = { title: string; detail: string };

const BEFORE_LIVE: Item[] = [
  {
    title: "Testmail per afzender",
    detail:
      "Eén test vanaf Reijner, Yoram en Evenementen naar team@ — handtekening, reply-to en Brevo-acceptatie checken.",
  },
  {
    title: "Reply-webhook end-to-end testen",
    detail:
      "Een echte reply laten binnenkomen en controleren dat hij in Resultaten verschijnt (en 'afmelden' tot uitsluiting leidt).",
  },
];

const V2: Item[] = [
  {
    title: "Automatische follow-up",
    detail:
      "Na 7–10 dagen zonder reply een korte, persoonlijke herinnering — eerst ter goedkeuring in de Wachtrij.",
  },
  {
    title: "Replies laten labelen door Claude",
    detail:
      "Geïnteresseerd / later / geen interesse / afmelden, met een voorstel-antwoord dat je kunt aanpassen.",
  },
  {
    title: "Leren per invalshoek",
    detail:
      "Resultaten per invalshoek en onderwerp gebruiken om de best scorende vaker voor te stellen.",
  },
  {
    title: "Wekelijkse samenvatting",
    detail:
      "Maandagmail aan het team: verstuurd, reacties en de kansrijkste bedrijven van deze week.",
  },
  {
    title: "Nieuwe aanleidingen automatisch",
    detail:
      "Jubilea, verhuizingen en groeinieuws oppikken zodat de lijst zichzelf aanvult.",
  },
  {
    title: "Slim inplannen",
    detail:
      "Verzenden op de beste dagen en tijden, met een opbouwend maximum per dag voor een gezonde domeinreputatie.",
  },
  {
    title: "Bezichtiging direct inplannen",
    detail:
      "Bij interesse een link naar de agenda van Thuishaven meesturen.",
  },
  {
    title: "Contact bij algemene adressen",
    detail:
      "Bij info@-adressen automatisch een beslisser met persoonlijk adres zoeken (Apollo/Hunter).",
  },
];

function List({ items }: { items: Item[] }) {
  return (
    <ul className="divide-y divide-border border border-border">
      {items.map((i) => (
        <li key={i.title} className="px-4 py-3">
          <p className="font-medium text-text">{i.title}</p>
          <p className="text-sm text-text-muted">{i.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminRoadmapPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/outreach");

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Alleen admin"
        title="Roadmap"
        description="Wat er nog moet vóór live versturen, en ideeën voor v2 van de outreach-tool."
      />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm tracking-[0.12em]">Vóór live</h2>
          <StatusBadge tone="warn">{BEFORE_LIVE.length} open</StatusBadge>
        </div>
        <List items={BEFORE_LIVE} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm tracking-[0.12em]">v2</h2>
          <StatusBadge tone="neutral">{V2.length} ideeën</StatusBadge>
        </div>
        <List items={V2} />
      </section>
    </div>
  );
}
