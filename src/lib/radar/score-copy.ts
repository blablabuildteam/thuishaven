/**
 * Centrale uitlegteksten voor Radar-scores.
 * Gebruikt door info-tips én /radar/uitleg.
 */

export type RadarScoreTopic = {
  id: string;
  title: string;
  short: string;
  body: string;
};

export const RADAR_SCORE_TOPICS: RadarScoreTopic[] = [
  {
    id: "totaal",
    title: "Totaalscore",
    short:
      "Gecombineerde score 0–100: 45% momentum + 30% fit + 25% bookability.",
    body: "De totaalscore (ook “Score” in de lijst) is een gewogen som van drie delen. Momentum weegt het zwaarst (45%), daarna fit voor Thuishaven (30%), daarna bookability (25%). Hoe hoger, hoe interessanter om nu te volgen — mits “nieuw voor Thuishaven”.",
  },
  {
    id: "momentum",
    title: "Momentum",
    short:
      "Groeit de artiest? Meer gigs, hogere billing, meer landen, RA-volgersgroei.",
    body: "Momentum kijkt naar de laatste ±90 dagen versus de 90 dagen daarvoor: aantal gigs, of iemand hoger op de line-up komt, in hoeveel landen, en (als we snapshots hebben) groei in RA-volgers. Sterke sprongen geven hoge momentum — dat voedt ook alerts zoals “snelle groei” en “doorbraak”.",
  },
  {
    id: "fit",
    title: "Fit",
    short:
      "Past bij Thuishaven? Early clubs, NL-audience, overlap met TH-artiesten.",
    body: "Fit meet of de speelplekken en context bij Thuishaven horen: aandeel early-tier venues, recente clubs, woonland NL, NL-audience (aandeel NL-gigs + RA regions), en overlap met venues waar Thuishaven-artiesten ook speelden. Iemand die alleen mega-festivals doet scoort lager op fit.",
  },
  {
    id: "nl-audience",
    title: "NL-audience",
    short:
      "Proxy voor Nederlands publiek: NL-gigs + resident + RA regions.",
    body: "YouTube geeft geen publieksgeo voor andermans video’s. Daarom meten we NL-audience via booking-geografie: aandeel recente gigs in NL, resident country, en RA “regions most played”. Hoge score = waarschijnlijk NL-crowd → hogere fit.",
  },
  {
    id: "mixseries",
    title: "Mixseries / sets",
    short:
      "Boiler Room, HÖR, … YouTube-views op sets als early viral signaal.",
    body: "We watchen curated YouTube-kanalen (Boiler Room, HÖR, e.a.). Matches op artiestennaam + view-spikes geven mixseries-alerts. Geen ranking in de hoofdscore (nog), wel zichtbaar in dossier en alerts — handig als een set “vliegt” vóór de clubtour.",
  },
  {
    id: "bookability",
    title: "Bookable",
    short:
      "Nog te boeken? Te groot / agency / te hoge attending → lager.",
    body: "Bookability daalt als Spotify/RA-volgers of attending te groot worden, als er een boekingsbureau in de RA-bio staat, of als iemand al ver in de discovery-keten zit. Lage bookability + hoge momentum = “venster sluit”: interessant, maar niet te lang wachten.",
  },
  {
    id: "velocity",
    title: "Velocity",
    short: "Tempo van groei in gigs t.o.v. vorig kwartaal.",
    body: "Velocity is een aparte groeimaat (0–100) op basis van de toename in gigs. Die wordt gebruikt voor alerts (drempel in Instellingen), niet als kolom in de hoofdscore — wel verwant aan momentum.",
  },
  {
    id: "curator",
    title: "Curator-score (venues)",
    short:
      "Handmatige 0–100: hoe sterk deze club/festival early talent signaleert.",
    body: "Geen RA-cijfer. Wij zetten per startlijst-venue een curator-score: hoog = kleine/scherpe plekken of festivals waar breakouts vroeg staan (Garage Noord, Draaimolen). Laag = grotere namen / later in de curve (Paradiso, Awakenings). Later kunnen we dit herberekenen uit breakout-historie.",
  },
  {
    id: "overlap",
    title: "Overlap-score (suggesties)",
    short:
      "Automatisch: hoeveel Radar-artiesten spelen hier (en hoe sterk).",
    body: "Bij venue-suggesties: aantal verschillende Radar-artiesten × aandeel met score ≥ 50. Helpt om ruis (toevallige festivals) van nuttige clubs te scheiden. Geen curator-oordeel.",
  },
  {
    id: "nieuw",
    title: "Nieuw voor Thuishaven",
    short: "Filter: nog nooit (of 0×) bij Thuishaven geboekt.",
    body: "Standaard toont de artiestenlijst alleen namen met home_gig_count = 0. Artiesten die al bij Thuishaven speelden zijn fit-ankers, geen ontdekking — die zet je aan met de toggle.",
  },
  {
    id: "alerts",
    title: "Alerts",
    short: "Signalen: nieuw, velocity, doorbraak, venster sluit, mixseries.",
    body: "Alerts gaan alleen over artiesten die nog niet bij Thuishaven speelden en niet in status gepasseerd/niet-relevant/geboekt. Drempels stel je in bij Instellingen. Mixseries-alerts komen uit YouTube-set views. Oude ruis is opgeschoond; nieuwe alerts komen uit de cron/rescore.",
  },
  {
    id: "bronnen",
    title: "Bronnen (multi-source)",
    short:
      "RA + websites + IG + mixseries YT + SoundCloud + handmatige line-ups.",
    body: "Radar scoort niet alleen Resident Advisor. We trekken feesten uit venue-websites, Instagram (Apify), handmatige line-ups, mixseries-YouTube en SoundCloud-plays voor de shortlist. Alles landt in parties/metrics met bron. Social Δ (RA/IG/SC) + labels + NL-audience voeden scores en alerts.",
  },
  {
    id: "feesten",
    title: "Feesten",
    short: "Eersteklas parties met line-up, bron en status (live / te reviewen).",
    body: "Onder Feesten zie je aankomende parties uit alle bronnen. IG-posts met onzekere parse gaan naar “te reviewen”. Goedkeuren publiceert ze; afwijzen verbergt ze. Klik een naam om het artiestendossier te openen.",
  },
];

export function radarScoreTopic(id: string): RadarScoreTopic | undefined {
  return RADAR_SCORE_TOPICS.find((t) => t.id === id);
}
