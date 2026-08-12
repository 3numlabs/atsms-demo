import {
  BrowserOAuthClient,
  buildLoopbackClientId,
} from "@atproto/oauth-client-browser";
import { APP_URL, OAUTH_SCOPE } from "./constants";

let oauthClient: BrowserOAuthClient | null = null;

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (oauthClient) return oauthClient;

  const isDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]";

  if (isDev) {
    // Build loopback client_id with scope included
    const baseClientId = buildLoopbackClientId(window.location);
    const clientId = baseClientId + "&scope=" + encodeURIComponent(OAUTH_SCOPE);

    oauthClient = new BrowserOAuthClient({
      handleResolver: "https://bsky.social",
      clientMetadata: {
        client_id: clientId as any,
        redirect_uris: [
          `http://${window.location.hostname}:${window.location.port}/` as any,
        ],
        scope: OAUTH_SCOPE,
        response_types: ["code"],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
        application_type: "native",
        dpop_bound_access_tokens: true,
      },
    });
  } else {
    oauthClient = await BrowserOAuthClient.load({
      clientId: `${APP_URL}/client-metadata.json`,
      handleResolver: "https://bsky.social",
    });
  }

  return oauthClient;
}

export async function startOAuthFlow(handle: string): Promise<void> {
  const client = await getOAuthClient();
  await client.signIn(handle, {
    signal: new AbortController().signal,
    scope: OAUTH_SCOPE,
  });
}
