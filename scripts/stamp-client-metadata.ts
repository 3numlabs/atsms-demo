/**
 * Stamp dist/client-metadata.json with the deploy origin. atproto OAuth
 * requires the client metadata to be served AT its own client_id URL with
 * same-origin redirect URIs, so each deployment target gets its origin
 * written in. Usage: bun scripts/stamp-client-metadata.ts https://origin
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const origin = process.argv[2];
if (!origin?.startsWith("https://")) {
  console.error("Usage: bun scripts/stamp-client-metadata.ts https://<origin>");
  process.exit(1);
}
const path = "dist/client-metadata.json";
const meta = JSON.parse(readFileSync(path, "utf8"));
meta.client_id = `${origin}/client-metadata.json`;
meta.client_uri = origin;
meta.redirect_uris = [`${origin}/callback`];
writeFileSync(path, JSON.stringify(meta, null, 2) + "\n");
console.log(`stamped ${path} for ${origin}`);

// The Pages-style _redirects file is for the demo.atsms.at Pages deploy; the
// worker-assets deploy handles SPA fallback natively and rejects it.
if (existsSync("dist/_redirects")) {
  rmSync("dist/_redirects");
  console.log("removed dist/_redirects (worker-assets deploy)");
}
