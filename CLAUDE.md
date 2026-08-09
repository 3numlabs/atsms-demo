# ATSMS Demo

Slack-like E2E encrypted messaging demo on AT Protocol.

> **Ported to the v2 message format (2026-08-01).** Runs on the `ATSMS` client over the v2 CBOR
> content format (umbrella `docs/message-format.md`). Thread mode is DELIBERATE (sdk-shape.md
> Part A): secure conversation (DCGKA) or one-shot notice thread (X509), chosen via
> `atsms.reachability()` in the new-conversation flow, pinned per thread — no silent fallback. Call signaling is ephemeral `call` parts via `onSignal` — never
> persisted, which retires the replay workarounds documented in `docs/webrtc-over-atsms.md`.
> Calls require a DCGKA conversation (one-shot threads are text-only). Not yet re-verified live
> against the deployed worker after the port.

## Stack
- React 19, Vite 8, TypeScript 6, Tailwind CSS v4, Zustand
- `@atsms/client` (linked from `../atsms/packages/client`) for crypto, storage, transport
- `@atproto/oauth-client-browser` for AT Protocol OAuth
- Hosted on Cloudflare Pages at `demo.atsms.at`

## Commands
- `bun install` - install dependencies
- `bun run dev` - start dev server (serves on 127.0.0.1 for OAuth loopback)
- `bun run build` - production build (output: `dist/`)
- `bun run preview` - preview production build

## Config
- Worker API: `https://atsms-api-dev.3numlabs.workers.dev`
- Email domain: `demo.atsms.at`
- OAuth client metadata: `public/client-metadata.json`

## Architecture
- `src/lib/` - core logic (OAuth, passkey-PRF, ATSMS bridge, WebRTC manager, constants)
- `src/stores/` - Zustand stores (auth, conversations, messages, UI, calls, profiles)
- `src/components/` - React components (layout, onboarding, conversations, messages, call, ui primitives)
- `src/pages/` - route pages (Login, Chat)

## Key Design Decisions
- Passkey-PRF required for key derivation (no fallback; mocked on localhost)
- Messages and conversations persist via IndexedDB (the `ATSMS` client over
  `EncryptedStorageAdapter(IndexedDBAdapter)` — the passkey PRF seed derives the storage KEK under
  its own reserved HKDF label, and the DCGKA state blobs (engine state + prekey ring) are
  envelope-encrypted at rest, same shape as atsms-web; v2 content rows + reaction/edit projections)
- Dark mode only (Slack-inspired palette)
- Library changes: `generateWithKey()` added to `ATSMSEndpointCertificate` in the SDK
- WebRTC signaling via E2E encrypted **ephemeral** messages (v2 `call` parts, format §8) —
  DCGKA conversations only
- WebRTC manager is imperative (module-level RTCPeerConnection, not in Zustand)

## Phases
- Phase 1: Onboarding + DM (done)
- Phase 2: Video/audio calls via WebRTC (done)
- Phase 3: Group chats — creation + group-aware display DONE (2026-08-03, ported from atsms-web at
  its EOL; batched addMembers underneath). Remove-member UI DONE (member panel in the group header;
  strong remove). Removal UX DONE: the removed device is notified by the protocol (the removal op is
  sealed to it), so the composer is replaced by a read-only notice and `metadata.removed` survives
  reload. Membership events render as system rows in the transcript — they are NOT messages (the
  content format keeps membership at the DCGKA layer), so the client records its own first-observation
  time in localStorage to interleave them; the authoritative causal-order history and the per-DID
  device inventory live in the member panel (debug). Remaining: add-member-to-existing-group UI,
  in-band group-name sync, group calls, leave()

## TODOs
- Remove debug logging from webrtc-manager.ts once calling is stable.
- Add real passkey-PRF support for production (currently mocked on localhost).
- Deploy to demo.atsms.at via Cloudflare Pages.
- Real unread tracking, ringtone for incoming calls, message read receipts, typing indicators, file/image attachments.
