@AGENTS.md

# Switchboard Mobile

Companion app for the Switchboard desktop app (`../switchboard`, an Electron app). It talks to Switchboard's remote-access API over the user's Tailscale network.

- This repository is public. Never commit tailnet addresses, hostnames, tokens, pairing codes or other personal data. The desktop address only ever comes from the pairing QR code at runtime.
- The wire protocol is defined by the desktop side (`remote-api.js` in `../switchboard`). Keep the TypeScript types in this app in step with it, and check the protocol version in the `hello` handshake.
- Modules shared with the desktop (`session-config.js`, `plan-parser.js`, `snooze.js`, `git-graph-layout.js`) are copied from `../switchboard/public` by `scripts/sync-shared.mjs` into `src/shared/vendor/`. Do not edit the copies by hand.
- Run `npm run typecheck` and `npm run lint` before declaring a task done.
