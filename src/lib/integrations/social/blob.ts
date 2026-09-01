import { put } from "@vercel/blob";

/** Persist a remote image so vision/analysis survives CDN expiry. */
export async function storeRemoteMediaAsBlob(options: {
  sourceUrl: string;
  pathname: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: "BLOB_READ_WRITE_TOKEN ontbreekt" };
  }

  try {
    const res = await fetch(options.sourceUrl, { cache: "no-store" });
    if (!res.ok) {
      return {
        ok: false,
        error: `Media download HTTP ${res.status}`,
      };
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const body = await res.arrayBuffer();
    const blob = await put(options.pathname, body, {
      access: "public",
      contentType,
      token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { ok: true, url: blob.url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Blob upload mislukt",
    };
  }
}

export function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}
