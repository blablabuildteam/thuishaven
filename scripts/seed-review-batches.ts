/**
 * Seed three review bakjes (Evenementen / Reiner / Yoram) with draft→queued mails.
 * Run: npx tsx --env-file=.env.local scripts/seed-review-batches.ts
 */
import { eq } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { outreachBatches } from "../src/lib/db/schema";
import { generateAndStoreDraft } from "../src/lib/integrations/outreach";
import { enqueueEmails } from "../src/lib/outreach/batches";
import type { OutreachSenderProfileId } from "../src/lib/outreach/sender-profiles";
import type { OutreachVariantId } from "../src/lib/outreach/tone";

type Pick = { id: string; variantId: OutreachVariantId };

const BATCHES: Array<{
  name: string;
  senderProfileId: OutreachSenderProfileId;
  notes: string;
  picks: Pick[];
}> = [
  {
    name: "Review · Reiner · testronde 1",
    senderProfileId: "reiner",
    notes:
      "TE BEOORDELEN — eerste testronde via Reiner. Lees teksten na, stuur eventueel test, daarna Plan in + Auto-send. Nog NIET live.",
    picks: [
      { id: "cd2c9753-1c3c-444a-a565-3daf130f6cea", variantId: "warm_tour" },
      { id: "c201d742-f5cf-46f4-ac6b-ecf54f6f5a03", variantId: "warm_tour" },
      { id: "dae75241-6a04-4a93-8381-2d82e0141bb8", variantId: "seizoen" },
      { id: "2cfbbb55-652a-4854-95c6-328958788e3d", variantId: "jubileum" },
      { id: "bbff9fb4-10a9-4f09-a146-3f26932cb8f2", variantId: "jubileum" },
    ],
  },
  {
    name: "Review · Yoram · testronde 1",
    senderProfileId: "yoram",
    notes:
      "TE BEOORDELEN — eerste testronde via Yoram. Doelgroep-fit soms nog onbekend: check of dit bedrijf past vóór live send.",
    picks: [
      { id: "39ff5e9b-7d5a-4674-9976-f7363277de41", variantId: "jubileum" },
      { id: "f1c700c0-4e6f-4885-82c4-9fe82abef4d5", variantId: "jubileum" },
      { id: "3e09930f-e147-46e9-9468-0493328fbb5a", variantId: "warm_tour" },
      { id: "26261b6c-7e93-4aad-a923-59ed0b49badf", variantId: "jubileum" },
      { id: "9a883e6d-2d14-4e30-a02c-b8d52d55a3b1", variantId: "jubileum" },
    ],
  },
  {
    name: "Review · Evenementen · testronde 1",
    senderProfileId: "evenementen",
    notes:
      "TE BEOORDELEN — eerste testronde via Evenementen@-afzender. Check toon + of contactadres klopt.",
    picks: [
      { id: "0277964f-7fea-45a1-a7a3-1a8e84122f15", variantId: "jubileum" },
      { id: "ad720dcc-4b9f-4f3f-b128-d2114976b5c0", variantId: "jubileum" },
      { id: "c3c9308a-9c56-4833-83b9-daeef6e0b22c", variantId: "jubileum" },
      { id: "06868028-3363-42be-84c0-11a13e64a80e", variantId: "jubileum" },
      { id: "522cfdfc-aa49-43bb-b375-e9a936094f2c", variantId: "warm_tour" },
    ],
  },
];

async function renameFirstRun() {
  const db = getDb();
  await db
    .update(outreachBatches)
    .set({
      name: "Review · Reiner · First run (Keylane/Sanquin)",
      notes:
        "TE BEOORDELEN — 2 jubileum-mails al in bakje. Lees na vóór live. Onderdeel van testronde 1.",
      updatedAt: new Date(),
    })
    .where(eq(outreachBatches.name, "First run"));
}

async function seedOne(batch: (typeof BATCHES)[number]) {
  const emailIds: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];
  for (const pick of batch.picks) {
    const generated = await generateAndStoreDraft({
      prospectId: pick.id,
      variantId: pick.variantId,
    });
    if ("error" in generated) {
      errors.push({ id: pick.id, error: generated.error });
      continue;
    }
    emailIds.push(generated.emailId);
    console.log(
      `  draft ${generated.source} · ${generated.variantId} · ${generated.subject.slice(0, 60)}`,
    );
  }
  if (!emailIds.length) {
    return { error: `Geen drafts voor ${batch.name}`, errors };
  }
  const enqueued = await enqueueEmails({
    emailIds,
    batchName: batch.name,
    senderProfileId: batch.senderProfileId,
  });
  if ("error" in enqueued) {
    return { error: enqueued.error, errors };
  }
  const db = getDb();
  await db
    .update(outreachBatches)
    .set({ notes: batch.notes, updatedAt: new Date() })
    .where(eq(outreachBatches.id, enqueued.batchId));

  return {
    ok: true,
    batchId: enqueued.batchId,
    name: enqueued.batchName,
    count: enqueued.enqueued,
    sender: enqueued.senderEmail,
    errors,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL ontbreekt");
    process.exit(1);
  }
  console.log("Rename First run…");
  await renameFirstRun();

  for (const batch of BATCHES) {
    console.log(`\n=== ${batch.name} ===`);
    const result = await seedOne(batch);
    console.log(JSON.stringify(result, null, 2));
  }

  await endDb();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await endDb();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
