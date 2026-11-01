# Switchboard Mobile

A companion app for [Switchboard](https://github.com/doctly/switchboard): browse and manage your Claude Code and Codex sessions and projects from your phone.

The app talks directly to the Switchboard desktop app running on your computer, over your local network or your own [Tailscale](https://tailscale.com/) network. There is no cloud relay and no account: the phone and the computer only ever talk to each other, and every message between them is encrypted end to end.

> **Status:** early development. The remote-access server it needs is not in a Switchboard release yet.

## What it does today

- Pairs with a computer by scanning the QR code from Switchboard's **Mobile app access** dialog.
- Lists every session, grouped by folder, newest first, with its live state: working, waiting for you, running.
- Searches what was said in your sessions, and filters to running, pinned or today's sessions.
- Renames, pins, moves to a project, archives or stops a session (long-press or tap a row).
- Reconnects on its own when the computer comes back, and says why when it cannot.

Coming next: a live terminal for each session, a chat view of the conversation, starting and resuming sessions, projects, and Git with the Git Graph.

## Use it with Expo Go

You need Switchboard with the remote-access server on the computer, and [Expo Go](https://expo.dev/go) for SDK 58 on the phone. The phone and the computer must be on the same network (or the same Tailscale tailnet).

1. Start the app's dev server on the computer:

   ```bash
   npm install
   npx expo start
   ```

2. Open it on the phone: scan the QR code in the terminal with the iPhone camera, or from Expo Go on Android.
3. In Switchboard on the computer, turn on the **Mobile app access** switch in the sidebar header. With no phone paired yet, it shows a pairing QR code.
4. In the app, tap **Scan the pairing code** and scan that QR code, then **Pair**.

In Expo Go, scan the pairing code from inside the app: the phone's own camera cannot open `switchboard://` links, because Expo Go does not register that scheme. A development build (`npx expo run:ios` / `npx expo run:android`) does.

The pairing code works once and expires after two minutes. To pair again, right-click the switch on the computer and choose **Pair a phone…**. To remove a phone, right-click the switch and choose **Phones and port…**.

## How it works

- With the switch on, Switchboard listens on every network interface, on port 47100 by default. With the switch off, nothing listens.
- The pairing QR code carries the computer's addresses, its public key and a one-time code. The phone makes its own key pair, keeps the secret key in the iOS keychain or the Android keystore, and registers its public key on the computer.
- Each connection starts with a handshake in which both sides prove their keys, then uses fresh keys for that connection only (NaCl box, via [tweetnacl](https://github.com/dchest/tweetnacl-js)).
- One WebSocket carries requests, replies and live events. The phone can only call the methods the computer allows.

The protocol lives in one file shared with Switchboard: `scripts/sync-shared.mjs` copies it, and the other shared modules, from the `switchboard` checkout next to this one into `src/shared/vendor/`.

## Development

```bash
npm test              # Jest: the protocol client, pairing links, the session list
npm run typecheck
npm run lint
npm run sync-shared   # copy the shared modules from ../switchboard (master)
```

Add dependencies with `npx expo install <package>`, so their versions match the Expo SDK. Keep to modules Expo Go includes, so the app keeps running in Expo Go.

## License

MIT. See [LICENSE](LICENSE).
