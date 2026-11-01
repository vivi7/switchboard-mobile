# Switchboard Mobile

A companion app for [Switchboard](https://github.com/doctly/switchboard): browse and manage your Claude Code and Codex sessions and projects from your phone.

The app talks directly to the Switchboard desktop app running on your computer, over your local network or your own [Tailscale](https://tailscale.com/) network. There is no cloud relay and no account: the phone and the computer only ever talk to each other, and every message between them is encrypted end to end.

> **Status:** early development. The remote-access server it needs is not in a Switchboard release yet.

## What it does today

- Pairs with a computer by scanning the QR code from Switchboard's **Mobile app access** dialog.
- Lists every session, grouped by folder, newest first, with its live state: working, waiting for you, unread, running. Unread and waiting-for-you are the same marks the desktop shows: opening a session on the phone reads it on the computer too.
- Searches what was said in your sessions, and filters to running, pinned or today's sessions.
- Opens a session as a **chat** (the conversation, with tool calls you can expand) or as a **live terminal** (xterm.js), with keys a phone keyboard lacks (Esc, Tab, arrows, Ctrl-C, Shift+Enter) and a line to type into.
- **Fit to phone** resizes the session's terminal to the phone while you look at it; the computer gets its own size back when you leave.
- Starts a new Claude, Codex or terminal session in a project, track or folder, with a first message and the same options as the desktop; resumes (with or without changed options) and forks.
- Renames, pins, moves to a project, marks as read or unread, archives or stops a session (long-press a row).
- Tells you, while the app is open, when another session needs you or finishes its turn.
- **Projects**: active, snoozed and done; a project's plan and todos to tick, add to and start a session on; its tracks, sessions, schedules (run now, pause, edit) and folders; snooze, finish, rename, add tracks and attach folders, in place or as a worktree.
- **Files**: browse a project's folders, read and edit text and Markdown, look at images.
- **Git**: what changed in each repository, as a list or a tree, with diffs; the **Git Graph** with branches, tags, stashes and uncommitted changes, each commit's files and diffs, and its actions (check out, merge, rebase, push, pull, fetch, branch, tag, cherry-pick, revert, reset, stash), asking first for the ones that lose work.
- **IDE diffs**: a change Claude proposes in a session started on the computer with IDE emulation, to accept or reject from the phone.
- Usage limits of Claude and Codex, and Claude's recent activity.
- Reconnects on its own when the computer comes back, picking each terminal up where it left off, and says why when it cannot.

The Git Graph needs a Switchboard build that has it.

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

## Install it on a phone

Expo Go is the quickest way to try the app. To have it on the phone as an app of its own:

- **iPhone, free Apple ID.** On a Mac with Xcode, plug the phone in and run `npx expo run:ios --device --configuration Release`. Xcode signs the app with your personal team (add your Apple ID in Xcode › Settings › Accounts and pick the team when asked). An app signed this way stops opening after 7 days: run the same command again to reinstall it.
- **iPhone, Apple Developer account.** Build with EAS and install through TestFlight: `npx eas-cli@latest build:configure`, then `npx eas-cli@latest build --platform ios` and `npx eas-cli@latest submit --platform ios`.
- **Android.** With Android Studio's SDK installed, `npx expo run:android --variant release` builds and installs a release APK on a phone connected over USB (with USB debugging on). To build an APK to share instead, use EAS: `npx eas-cli@latest build:configure`, set the profile's Android build type to an APK, then `npx eas-cli@latest build --platform android --profile preview`.

A build of its own registers the `switchboard://` scheme, so the phone's camera can open a pairing QR code directly.

## How it works

- With the switch on, Switchboard listens on every network interface, on port 47100 by default. With the switch off, nothing listens.
- The pairing QR code carries the computer's addresses, its public key and a one-time code. The phone makes its own key pair, keeps the secret key in the iOS keychain or the Android keystore, and registers its public key on the computer.
- Each connection starts with a handshake in which both sides prove their keys, then uses fresh keys for that connection only (NaCl box, via [tweetnacl](https://github.com/dchest/tweetnacl-js)).
- One WebSocket carries requests, replies and live events. The phone can only call the methods the computer allows.

The protocol lives in one file shared with Switchboard: `scripts/sync-shared.mjs` copies it, and the other shared modules, from the `switchboard` checkout next to this one into `src/shared/vendor/`.

## Development

```bash
npm test              # Jest: the protocol client, pairing links, sessions, projects, Git, diffs, usage
npm run typecheck
npm run lint
npm run sync-shared   # copy the shared modules from ../switchboard (master)
npm run build-terminal # rebuild the terminal page from @xterm/xterm (also runs after npm install)
```

Add dependencies with `npx expo install <package>`, so their versions match the Expo SDK. Keep to modules Expo Go includes, so the app keeps running in Expo Go.

## License

MIT. See [LICENSE](LICENSE).
