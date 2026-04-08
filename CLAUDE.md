# ATSMS Demo

Slack-like E2E encrypted messaging demo on AT Protocol.

## Stack
- React 19, Vite 8, TypeScript 6, Tailwind CSS v4, Zustand
- `@atsms/sms` (linked from `../atsms-lib`) for crypto, storage, transport
- `@atproto/oauth-client-browser` for AT Protocol OAuth
- Hosted on Cloudflare Pages at `demo.atsms.at`

## Commands
- `bun install` - install dependencies
- `bun run dev` - start dev server
- `bun run build` - production build (output: `dist/`)
- `bun run preview` - preview production build

## Config
- Worker API: `https://atsms-api.enumdao.workers.dev`
- Email domain: `demo.atsms.at`
- OAuth client metadata: `public/client-metadata.json`

## Architecture
- `src/lib/` - core logic (OAuth, passkey-PRF, atsms bridge, constants)
- `src/stores/` - Zustand stores (auth, conversations, messages, UI)
- `src/components/` - React components (layout, onboarding, conversations, messages, ui primitives)
- `src/pages/` - route pages (Login, Callback, Chat)

## Key Design Decisions
- Passkey-PRF required for key derivation (no fallback)
- No message persistence across sessions (IndexedDB is session-scoped)
- Dark mode only (Slack-inspired palette)
- Library changes: `generateWithKey()` added to `ATSMSEndpointCertificate` in atsms-lib

## Phases
- Phase 1: Onboarding + DM (current)
- Phase 2: Video/audio calls (WebRTC)
- Phase 3: Group chats
