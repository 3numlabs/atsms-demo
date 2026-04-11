# AT-SMS Demo

A Slack-like, end-to-end encrypted messaging demo built on the AT Protocol.

Demonstrates the AT-SMS messaging system: identity via AT Protocol, X.509 certificates per device, S/MIME encryption, real-time delivery via WebSocket, and WebRTC audio/video calls — all over the AT-SMS encrypted transport.

## Features

- **Direct messaging** — Encrypted DMs to any AT Protocol user with a registered AT-SMS certificate
- **Audio/video calls** — WebRTC calls with mute, camera toggle, and full-screen UI
- **Slack-inspired dark UI** — Conversation sidebar, message pane, mobile-friendly layout
- **Bluesky profile integration** — Avatars and display names fetched from the public AT Protocol API

## Stack

- React 19 + Vite 8 + TypeScript 6
- Tailwind CSS v4
- Zustand state management
- `@atsms/sms` library (linked from `../atsms-lib`) for crypto, storage, and transport
- `@atproto/oauth-client-browser` for AT Protocol OAuth
- Cloudflare Pages hosting

## Getting Started

```bash
bun install
bun run dev
```

The dev server runs on `http://127.0.0.1:5173`. (The IP address is required because the AT Protocol OAuth loopback flow redirects there. Localhost is fine for the rest of the app.)

### Production Build

```bash
bun run build
```

Output goes to `dist/`. Deploy to Cloudflare Pages with the build directory as `dist/` and SPA fallback enabled (`public/_redirects` handles this).

## Architecture

```
src/
├── lib/                    Core logic
│   ├── atsms-bridge.ts    Facade over @atsms/sms
│   ├── webrtc-manager.ts  WebRTC peer connection and signaling
│   ├── webrtc-signaling.ts AT-SMS message wrapper for WebRTC payloads
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
7. The app connects to the AT-SMS worker via WebSocket and is ready to chat

On localhost, the passkey step is mocked because WebAuthn does not work over `127.0.0.1`. The rest of the flow (OAuth, cert generation, message exchange, WebRTC calls) is real.

## Documentation

- [`webrtc-over-atsms.md`](./webrtc-over-atsms.md) — Lessons learned implementing WebRTC calling over an E2E encrypted message transport
- [`turn-cloudflare.md`](./turn-cloudflare.md) — Proposal for replacing static TURN credentials with an authenticated Cloudflare TURN credential service (when present)
- [`CLAUDE.md`](./CLAUDE.md) — Architecture notes and TODOs

## Status

- **Phase 1** (Onboarding + DM) — done
- **Phase 2** (Video/audio calls via WebRTC) — done
- **Phase 3** (Group chats) — not started
