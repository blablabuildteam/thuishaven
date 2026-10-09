/**
 * Re-run AI generation for every draft/queued outreach mail that is still a template.
 * Usage: npx tsx scripts/regenerate-queue-ai.ts [--all]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getDb } = await import("../src/lib/db/client");
  const { outreachEmails } = await import("../src/lib/db/schema");
  const { regenerateStoredDraft } = await import("../src/lib/integrations/outreach");
  const { and, inArray, or, isNull, ne } = await import("drizzle-orm");

  const all = process.argv.includes("--all");
  const db = getDb();
  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        inArray(outreachEmails.status, ["draft", "queued"]),
        all
          ? undefined
          : or(
              isNull(outreachEmails.generationSource),
              ne(outreachEmails.generationSource, "ai"),
            ),
      ),
    );

  console.log(`${rows.length} mails te hergenereren`);
  let ai = 0;
  let fallback = 0;
  let failed = 0;
  for (const [i, row] of rows.entries()) {
    const result = await regenerateStoredDraft({ emailId: row.id });
    if ("error" in result) {
      failed += 1;
      console.log(`${i + 1}. FOUT ${row.id}: ${result.error}`);
      continue;
    }
    if (result.source === "ai") ai += 1;
    else {
      fallback += 1;
      console.log(`   reden: ${result.fallbackReason ?? "onbekend"}`);
    }
    console.log(
      `${i + 1}. ${result.source} · ${result.variantId} · ${result.body.split("\n").find((l) => l.trim() && !/^hi\b/i.test(l.trim()))?.slice(0, 90) ?? ""}`,
    );
  }
  console.log(`Klaar: ${ai} AI · ${fallback} template · ${failed} fout`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
