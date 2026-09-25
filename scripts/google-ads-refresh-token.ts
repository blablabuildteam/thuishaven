/**
 * One-time OAuth for Google Ads (desktop / loopback).
 * Sign in as the Google user that can see the Ads account, then the
 * refresh token is written to .env.local.
 *
 *   npx tsx scripts/google-ads-refresh-token.ts
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const SCOPE = "https://www.googleapis.com/auth/adwords";
const PORT = Number(process.env.GOOGLE_ADS_OAUTH_PORT ?? 18765);
const REDIRECT_URI = `http://127.0.0.1:${PORT}/`;
const ENV_PATH = resolve(process.cwd(), ".env.local");

const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    "GOOGLE_ADS_CLIENT_ID of GOOGLE_ADS_CLIENT_SECRET ontbreekt in .env.local",
  );
  process.exit(1);
}

function writeRefreshToken(token: string) {
  const current = readFileSync(ENV_PATH, "utf8");
  const line = `GOOGLE_ADS_REFRESH_TOKEN=${token}`;
  const next = /^GOOGLE_ADS_REFRESH_TOKEN=.*$/m.test(current)
    ? current.replace(/^GOOGLE_ADS_REFRESH_TOKEN=.*$/m, line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(ENV_PATH, next);
}

function openBrowser(url: string) {
  spawn("open", [url], { stdio: "ignore", detached: true }).unref();
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");
authUrl.searchParams.set("include_granted_scopes", "true");
authUrl.searchParams.set("login_hint", "xennith@blablabuild.com");

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<p>Google weigerde toegang: <code>${error}</code>. Je kunt dit tabblad sluiten.</p>`,
      );
      console.error(`OAuth error: ${error}`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("No code");
      return;
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const json = (await tokenRes.json()) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !json.refresh_token) {
      const detail = json.error_description ?? json.error ?? tokenRes.status;
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<p>Token-exchange mislukt: <code>${detail}</code>. Check of dit een Desktop-OAuth-client is.</p>`,
      );
      console.error(`Token exchange failed: ${detail}`);
      server.close();
      process.exit(1);
    }

    writeRefreshToken(json.refresh_token);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<p>Google Ads refresh token staat in <code>.env.local</code>. Dit tabblad mag dicht.</p>",
    );
    console.log("GOOGLE_ADS_REFRESH_TOKEN written to .env.local");
    server.close();
    process.exit(0);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Server error");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Sign in as xennith@blablabuild.com (MCC 315-570-5691).");
  console.log("If Google says the app is unverified: Advanced → Go to Thuishaven Dashboard.");
  console.log(authUrl.toString());
  openBrowser(authUrl.toString());
});

setTimeout(() => {
  console.error("Timed out waiting for Google login (15 min).");
  server.close();
  process.exit(1);
}, 15 * 60 * 1000);
