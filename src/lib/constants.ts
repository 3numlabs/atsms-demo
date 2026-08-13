/**
 * The relay this build talks to, and the mailto: domain it publishes. Both are
 * required at build time and have no default on purpose: a relay learns who
 * receives mail and when, so which one a deployment uses is a choice its
 * operator makes rather than one inherited from whoever wrote the code.
 *
 * Set them in `.env` (see `.env.example`) or in the environment of the build.
 */
function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in, or pass it to the build. ` +
        `There is deliberately no default relay — run atsms-worker yourself, or use one you trust.`,
    );
  }
  return value;
}

export const ATSMS_API_URL = required("VITE_ATSMS_API_URL", import.meta.env.VITE_ATSMS_API_URL);
export const EMAIL_DOMAIN = required("VITE_ATSMS_EMAIL_DOMAIN", import.meta.env.VITE_ATSMS_EMAIL_DOMAIN);
// The app is origin-agnostic: OAuth client metadata must live at (and name)
// whatever origin serves the app — demo.atsms.at (Pages, production) or
// atsms-demo-dev.*.workers.dev (worker assets, testing). client-metadata.json
// is stamped with the matching origin at deploy time (see deploy scripts).
export const APP_URL = window.location.origin;
export const OAUTH_CLIENT_METADATA_URL = `${APP_URL}/client-metadata.json`;
export const OAUTH_CALLBACK_URL = `${APP_URL}/callback`;
export const PLC_DIRECTORY_URL = "https://plc.directory";

/**
 * OAuth scope — the least the demo can ask for. It reads, writes and deletes
 * records in exactly three collections; profiles come from the public Bluesky
 * API and need no auth. `atproto` is the required base scope, and each
 * collection is named: prefix wildcards (`at.atsms.*`) are not permitted.
 *
 * Was `atproto transition:generic` — full read/write over the entire
 * repository, far more than a messaging demo should hold.
 *
 * The repeated-query-parameter form is what the authorization server accepts
 * for multiple collections; three separate `repo:<nsid>` scopes are rejected
 * (the PDS 401s the record write). A prefix wildcard (`collection=at.atsms.*`)
 * is worse than either: the consent screen then shows no repository permission
 * at all, so the grant is dropped silently rather than refused. Name every
 * collection. Granular scopes are live on bsky.social but
 * still stabilizing upstream, so keep `public/client-metadata.json` identical
 * to this string and re-verify sign-in against a real account after changing
 * either. Verified live 2026-08-12.
 */
export const OAUTH_SCOPE =
  "atproto repo?collection=at.atsms.x509&collection=at.atsms.prekey&collection=at.atsms.inbox";
