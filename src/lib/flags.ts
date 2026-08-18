// Feature flags for test-only UI. Visibility gating, not secrecy (the repo is public).
// Arm: visit /?flags=sms   Clear: /?flags=   Persists per browser in localStorage.
const KEY = "atsms_flags";
const fromUrl = new URLSearchParams(window.location.search).get("flags");
if (fromUrl !== null) localStorage.setItem(KEY, fromUrl);
export function hasFlag(name: string): boolean {
  return (localStorage.getItem(KEY) ?? "").split(",").map((s) => s.trim()).includes(name);
}
