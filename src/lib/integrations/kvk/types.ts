/**
 * KvK Handelsregister API types (Zoeken v2, Basisprofiel, Vestigingsprofiel).
 * @see https://developers.kvk.nl/nl/documentation
 */

export type KvkLink = { rel: string; href: string };

export type KvkZoekenResult = {
  kvkNummer?: string;
  vestigingsnummer?: string;
  naam?: string;
  type?: string;
  adres?: {
    binnenlandsAdres?: {
      type?: string;
      straatnaam?: string;
      plaats?: string;
      postcode?: string;
    };
  };
  links?: KvkLink[];
};

export type KvkZoekenResponse = {
  pagina?: number;
  resultatenPerPagina?: number;
  totaal?: number;
  resultaten?: KvkZoekenResult[];
  links?: KvkLink[];
};

export type KvkSbiActiviteit = {
  sbiCode?: string;
  sbiOmschrijving?: string;
  indHoofdactiviteit?: string;
};

export type KvkMaterieleRegistratie = {
  datumAanvang?: string;
  datumEinde?: string;
};

export type KvkBasisprofiel = {
  kvkNummer?: string;
  indNonMailing?: string;
  naam?: string;
  formeleRegistratiedatum?: string;
  materieleRegistratie?: KvkMaterieleRegistratie;
  statutaireNaam?: string;
  handelsnamen?: Array<{ naam?: string; volgorde?: number }>;
  sbiActiviteiten?: KvkSbiActiviteit[];
  _embedded?: {
    hoofdvestiging?: {
      vestigingsnummer?: string;
      eersteHandelsnaam?: string;
      indHoofdvestiging?: string;
      adressen?: KvkAdres[];
      websites?: string[];
      links?: KvkLink[];
    };
    eigenaar?: Record<string, unknown>;
  };
  links?: KvkLink[];
};

export type KvkAdres = {
  type?: string;
  volledigAdres?: string;
  straatnaam?: string;
  huisnummer?: number;
  postcode?: string;
  plaats?: string;
  land?: string;
};

export type KvkVestigingsprofiel = {
  vestigingsnummer?: string;
  kvkNummer?: string;
  indNonMailing?: string;
  formeleRegistratiedatum?: string;
  materieleRegistratie?: KvkMaterieleRegistratie;
  eersteHandelsnaam?: string;
  indHoofdvestiging?: string;
  indCommercieleVestiging?: string;
  voltijdWerkzamePersonen?: number;
  deeltijdWerkzamePersonen?: number;
  totaalWerkzamePersonen?: number;
  handelsnamen?: Array<{ naam?: string; volgorde?: number }>;
  adressen?: KvkAdres[];
  websites?: string[];
  sbiActiviteiten?: KvkSbiActiviteit[];
  links?: KvkLink[];
};

/** Normalized prospect candidate for outreach CRM. */
export type KvkProspectCandidate = {
  kvkNumber: string;
  vestigingsnummer?: string;
  companyName: string;
  city?: string;
  postcode?: string;
  website?: string;
  employeeCount?: number;
  foundedAt?: string; // ISO date
  anniversaryYears?: number;
  sector?: string;
  sbiCode?: string;
  nonMailing: boolean;
  source: "kvk";
};
