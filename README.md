# Switchboard Mobile

A companion app for [Switchboard](https://github.com/doctly/switchboard): browse and manage your Claude Code and Codex sessions and projects from your phone.

The app talks directly to the Switchboard desktop app running on your computer, over your own [Tailscale](https://tailscale.com/) network. There is no cloud relay and no account: the phone and the computer only ever talk to each other.

> **Status:** early development. The remote-access API it needs is not in a Switchboard release yet.

## How it works

- Switchboard listens on `127.0.0.1` only. `tailscale serve` publishes it to the devices on your tailnet, with a valid HTTPS certificate.
- You pair the phone by scanning a QR code shown in Switchboard's settings. Each phone gets its own token, which you can revoke from the desktop at any time.
- The app uses one WebSocket for requests, live session status and terminal output.

## Planned features

- Every session, grouped by folder, with its live status (working, waiting for you, unread) and full-text search.
- A live terminal for any running session, with a key bar for Esc, Tab, arrows and Ctrl-C.
- A chat-style view of the conversation.
- Start, resume, fork and stop sessions.
- Projects: tracks, plan progress and todos.
- Git status and diffs, and a Git Graph with branch and commit actions.

## Development

Requirements: Node.js 20 or newer, Xcode for iOS, Android Studio for Android.

```bash
npm install
npx expo start          # dev server
npx expo run:ios        # build and run on the iOS simulator or a device
npx expo run:android    # build and run on the Android emulator or a device
npm run typecheck
npm run lint
```

Add dependencies with `npx expo install <package>`, so their versions match the Expo SDK.

## License

MIT. See [LICENSE](LICENSE).
