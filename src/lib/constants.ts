export const ATSMS_API_URL = "https://atsms-api-dev.3numlabs.workers.dev";
export const EMAIL_DOMAIN = "demo.atsms.at";
// The app is origin-agnostic: OAuth client metadata must live at (and name)
// whatever origin serves the app — demo.atsms.at (Pages, production) or
// atsms-demo-dev.*.workers.dev (worker assets, testing). client-metadata.json
// is stamped with the matching origin at deploy time (see deploy scripts).
export const APP_URL = window.location.origin;
export const OAUTH_CLIENT_METADATA_URL = `${APP_URL}/client-metadata.json`;
export const OAUTH_CALLBACK_URL = `${APP_URL}/callback`;
export const PLC_DIRECTORY_URL = "https://plc.directory";
