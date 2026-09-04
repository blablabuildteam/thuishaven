/**
 * KvK Handelsregister client — Zoeken + Basisprofiel + Vestigingsprofiel.
 * Needs API-abonnement with those three products + apikey header.
 */

import { recordUsage } from "@/lib/usage/store";
import type {
  KvkBasisprofiel,
  KvkVestigingsprofiel,
  KvkZoekenResponse,
} from "./types";

function baseUrl(): string {
  return (process.env.KVK_API_URL || "https://api.kvk.nl").replace(/\/$/, "");
}

function apiKey(): string | null {
  return process.env.KVK_API_KEY?.trim() || null;
}

export function hasKvkConfig(): boolean {
  return Boolean(apiKey());
}

async function kvkGet<T>(
  path: string,
  operation: string,
): Promise<{ data?: T; error?: string; status?: number }> {
  const key = apiKey();
  if (!key) return { error: "KVK_API_KEY ontbreekt" };

  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = { raw: text };
    }

    try {
      await recordUsage({
        tool: "outreach",
        vendor: "kvk",
        operation,
        units: 1,
        unitLabel: "call",
        meta: { status: res.status, path },
      });
    } catch {
      /* optional */
    }

    if (!res.ok) {
      const msg =
        typeof json === "object" &&
        json &&
        "fout" in json &&
        Array.isArray((json as { fout?: unknown }).fout)
          ? JSON.stringify((json as { fout: unknown }).fout)
          : `KvK HTTP ${res.status}`;
      return { error: msg, status: res.status };
    }

    return { data: json as T, status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

export type KvkZoekenParams = {
  naam?: string;
  kvkNummer?: string;
  vestigingsnummer?: string;
  straatnaam?: string;
  plaats?: string;
  postcode?: string;
  /** hoofdvestiging | nevenvestiging | rechtspersoon */
  type?: string;
  pagina?: number;
  resultatenPerPagina?: number;
};

export async function kvkZoeken(
  params: KvkZoekenParams,
): Promise<{ data?: KvkZoekenResponse; error?: string; status?: number }> {
  const q = new URLSearchParams();
  if (params.naam) q.set("naam", params.naam);
  if (params.kvkNummer) q.set("kvkNummer", params.kvkNummer);
  if (params.vestigingsnummer) q.set("vestigingsnummer", params.vestigingsnummer);
  if (params.straatnaam) q.set("straatnaam", params.straatnaam);
  if (params.plaats) q.set("plaats", params.plaats);
  if (params.postcode) q.set("postcode", params.postcode);
  if (params.type) q.set("type", params.type);
  q.set("pagina", String(params.pagina ?? 1));
  q.set(
    "resultatenPerPagina",
    String(Math.min(params.resultatenPerPagina ?? 10, 100)),
  );

  return kvkGet<KvkZoekenResponse>(
    `/api/v2/zoeken?${q.toString()}`,
    "zoeken",
  );
}

export async function kvkBasisprofiel(
  kvkNummer: string,
): Promise<{ data?: KvkBasisprofiel; error?: string; status?: number }> {
  return kvkGet<KvkBasisprofiel>(
    `/api/v1/basisprofielen/${encodeURIComponent(kvkNummer)}`,
    "basisprofiel",
  );
}

export async function kvkVestigingsprofiel(
  vestigingsnummer: string,
): Promise<{ data?: KvkVestigingsprofiel; error?: string; status?: number }> {
  return kvkGet<KvkVestigingsprofiel>(
    `/api/v1/vestigingsprofielen/${encodeURIComponent(vestigingsnummer)}`,
    "vestigingsprofiel",
  );
}
