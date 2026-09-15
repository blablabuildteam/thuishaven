import { config } from "dotenv";
config({ path: ".env.local" });

import { endDb } from "../src/lib/db/client";
import { linkCampaignsToEditions } from "../src/lib/editions/link-campaigns";
import { linkPostsToEditions } from "../src/lib/marketing/edition-link";

async function main() {
  const posts = await linkPostsToEditions({
    persist: true,
    onlyUnlinked: true,
    limit: 500,
    minConfidence: 0.55,
  });
  const mails = await linkCampaignsToEditions({
    persist: true,
    minConfidence: 0.55,
  });
  console.log(
    JSON.stringify(
      {
        posts: {
          ok: posts.ok,
          linked: posts.linked,
          reviewed: posts.reviewed,
          error: posts.error,
        },
        mails: {
          ok: mails.ok,
          linked: mails.linked,
          reviewed: mails.reviewed,
          error: mails.error,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => endDb());
