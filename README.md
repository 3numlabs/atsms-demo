# ATSMS Demo

A Slack-like, end-to-end encrypted messaging demo on AT Protocol identities — the browser reference
client for [ATSMS](https://github.com/3numlabs), and the easiest way to see the protocol work.

**A proof of concept.** The cryptography has not been independently reviewed, and everything lives in
your browser: clear the site data and the messages are gone, because no server holds a readable copy.
The app says so before you sign in.

## Features

- **Direct messages and groups** — encrypted with the group key agreement, so adding or removing someone
  rotates keys immediately and a removed member cannot read what follows
- **Audio and video calls** — WebRTC, with setup signalled over the same encrypted channel
- **Several devices per account** — authorize a second device from one you already have, and your
  conversations include it from then on
- **Shared group state** — a group's name is agreed by every member, not a label on one device
- **Membership you can inspect** — who has joined, who has never been heard from, and a way to re-send
  admission material to someone whose invitation may have been lost
- **Slack-inspired dark UI** — conversation sidebar, message pane, mobile-friendly layout
- **Bluesky profile integration** — avatars and display names from the public AT Protocol API

## Stack

- React 19 + Vite 8 + TypeScript 6
- Tailwind CSS v4
- Zustand state management
- `@atsms/client` (linked from `../atsms/packages/client`) for crypto, storage, and transport
- `@atproto/oauth-client-browser` for AT Protocol OAuth
- Deployed as a Cloudflare Worker serving static assets

## Getting Started

```bash
bun install
cp .env.example .env      # then fill in the relay and mailto: domain
bun run dev
```

**Both values in `.env` are required and have no default.** A relay learns who receives mail and when, so
which one a deployment uses is a choice its operator makes; the build fails rather than silently
inheriting ours. Run the reference relay (`atsms-worker`) yourself, or point at one you trust.

The dev server runs on `http://127.0.0.1:5173`. (The IP address is required because the AT Protocol OAuth loopback flow redirects there. Localhost is fine for the rest of the app.)

### Production Build

```bash
bun run build
```

Output goes to `dist/`. The deploy target is a Cloudflare Worker serving those assets with SPA fallback,
configured in `wrangler.jsonc`; `bun run deploy:dev` builds, stamps `client-metadata.json` with the
deploy origin, and pushes it.

The stamping matters: AT Protocol OAuth requires the client metadata to be served *at* its own
`client_id` URL with same-origin redirect URIs, so each deployment origin gets written in at deploy
time. The copy in `public/` is a template.

## Architecture

```
src/
├── lib/                    Core logic
│   ├── atsms-bridge.ts    Facade over @atsms/client
│   ├── webrtc-manager.ts  WebRTC peer connection and signaling
│   ├── webrtc-signaling.ts ATSMS message wrapper for WebRTC payloads
│   ├── passkey-prf.ts     Passkey-PRF key derivation (mocked on localhost)
│   ├── oauth.ts           BrowserOAuthClient setup
│   └── constants.ts
├── stores/                 Zustand state stores
│   ├── auth-store.ts      User identity and certificate
│   ├── conversation-store.ts
│   ├── message-store.ts
│   ├── ui-store.ts
│   ├── call-store.ts      Call status, media streams
│   └── profile-store.ts   Bluesky profile cache
├── components/
│   ├── layout/            AppShell, Sidebar, Header, UserProfile
│   ├── onboarding/        OnboardingFlow, HandleInput, PasskeySetup
│   ├── conversations/     ConversationList, NewConversation modal
│   ├── messages/          MessagePane, MessageList, MessageBubble, Composer
│   ├── call/              CallButtons, CallOverlay, CallControls, IncomingCallModal
│   └── ui/                Avatar, Button, Input, Modal, Spinner
└── pages/                  LoginPage, ChatPage
```

## Onboarding Flow

1. User enters their `@handle.bsky.social`
2. Handle is resolved to a DID and the user's PDS is discovered
3. AT Protocol OAuth flow runs against the user's PDS
4. After OAuth, the app derives a P-256 private key from a passkey using the WebAuthn PRF extension
5. If a matching X.509 certificate already exists on the user's PDS, it is reused
6. Otherwise, a new certificate is generated with the derived key and stored on the PDS at `at.atsms.x509`
7. The app connects to the ATSMS worker via WebSocket and is ready to chat

On localhost, the passkey step is mocked because WebAuthn does not work over `127.0.0.1`. The rest of the flow (OAuth, cert generation, message exchange, WebRTC calls) is real.

## Documentation

- [`webrtc-over-atsms.md`](./webrtc-over-atsms.md) — Lessons learned implementing WebRTC calling over an E2E encrypted message transport
- [`turn-cloudflare.md`](./turn-cloudflare.md) — Proposal for replacing static TURN credentials with an authenticated Cloudflare TURN credential service (when present)
- [`CLAUDE.md`](./CLAUDE.md) — Architecture notes and TODOs

## Status

- **Phase 1** (Onboarding + DM) — done
- **Phase 2** (Video/audio calls via WebRTC) — done
- **Phase 3** (Group chats) — not started
