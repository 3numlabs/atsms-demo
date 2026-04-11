# AT-SMS Demo

Slack-like E2E encrypted messaging demo on AT Protocol.

## Stack
- React 19, Vite 8, TypeScript 6, Tailwind CSS v4, Zustand
- `@atsms/sms` (linked from `../atsms-lib`) for crypto, storage, transport
- `@atproto/oauth-client-browser` for AT Protocol OAuth
- Hosted on Cloudflare Pages at `demo.atsms.at`

## Commands
- `bun install` - install dependencies
- `bun run dev` - start dev server (serves on 127.0.0.1 for OAuth loopback)
- `bun run build` - production build (output: `dist/`)
- `bun run preview` - preview production build

## Config
- Worker API: `https://atsms-api.enumdao.workers.dev`
- Email domain: `demo.atsms.at`
- OAuth client metadata: `public/client-metadata.json`

## Architecture
- `src/lib/` - core logic (OAuth, passkey-PRF, AT-SMS bridge, WebRTC manager, constants)
- `src/stores/` - Zustand stores (auth, conversations, messages, UI, calls, profiles)
- `src/components/` - React components (layout, onboarding, conversations, messages, call, ui primitives)
- `src/pages/` - route pages (Login, Chat)

## Key Design Decisions
- Passkey-PRF required for key derivation (no fallback; mocked on localhost)
- Messages and conversations persist via IndexedDB (`ATSMSStorageManager` + `IndexedDBAdapter`)
- Dark mode only (Slack-inspired palette)
- Library changes: `generateWithKey()` added to `ATSMSEndpointCertificate` in atsms-lib
- WebRTC signaling via E2E encrypted AT-SMS messages (contentType: "atsms/webrtc")
- WebRTC manager is imperative (module-level RTCPeerConnection, not in Zustand)

## Phases
- Phase 1: Onboarding + DM (done)
- Phase 2: Video/audio calls via WebRTC (done)
- Phase 3: Group chats

## TODOs
- Remove debug logging from webrtc-manager.ts once calling is stable.
- Add real passkey-PRF support for production (currently mocked on localhost).
- Deploy to demo.atsms.at via Cloudflare Pages.
- Real unread tracking, ringtone for incoming calls, message read receipts, typing indicators, file/image attachments.
