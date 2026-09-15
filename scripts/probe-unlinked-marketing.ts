import { config } from "dotenv";
config({ path: ".env.local" });

import { isNull, sql } from "drizzle-orm";
import { endDb, getDb } from "../src/lib/db/client";
import { emailCampaignMetrics, marketingPosts } from "../src/lib/db/schema";

async function main() {
  const db = getDb();
  const posts = await db
    .select({
      channel: marketingPosts.channel,
      title: marketingPosts.title,
      publishedAt: marketingPosts.publishedAt,
    })
    .from(marketingPosts)
    .where(isNull(marketingPosts.editionId))
    .orderBy(sql`${marketingPosts.publishedAt} desc nulls last`)
    .limit(25);

  const mails = await db
    .select({
      name: emailCampaignMetrics.name,
      sentAt: emailCampaignMetrics.sentAt,
    })
    .from(emailCampaignMetrics)
    .where(isNull(emailCampaignMetrics.editionId))
    .orderBy(sql`${emailCampaignMetrics.sentAt} desc nulls last`)
    .limit(25);

  console.log(
    JSON.stringify(
      {
        posts: posts.map((p) => ({
          channel: p.channel,
          title: p.title,
          day: p.publishedAt?.toISOString().slice(0, 10) ?? null,
        })),
        mails: mails.map((m) => ({
          name: m.name,
          day: m.sentAt?.toISOString().slice(0, 10) ?? null,
        })),
      },
      null,
      2,
    ),
  );
  await endDb();
}

main().catch(async (err) => {
  console.error(err);
  await endDb();
  process.exit(1);
});
