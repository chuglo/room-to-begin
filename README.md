# Room to Begin

A calm, mobile-first guided decluttering experience for people who feel overwhelmed and do not know where to start.

**Live app:** https://chuglo.github.io/room-to-begin/

## Use it

Open the [live app](https://chuglo.github.io/room-to-begin/) in a current browser. `index.html` also opens directly for the guided session, but installation and offline caching require HTTPS or localhost.

For an app-like launch:

- Android/Chrome: open the browser menu and choose **Install app** or **Add to Home screen**.
- iPhone/Safari: tap **Share**, choose **Add to Home Screen**, then confirm.

After one successful online load, the installed app shell is available offline. Progress and history remain local to that browser and device; there is no account, sync, cloud backup, or shared household history.

## Product hypothesis

People are more likely to complete a decluttering session when the product:

- gives exactly one bounded action at a time;
- states where every collected item should go;
- prevents detours and abandoned sorting piles;
- offers immediate help when the user feels stuck;
- ends with a safe closing loop rather than encouraging endless momentum.

## Included in v2

- One-active-session, resume-first home
- Room-only **Start now**, plus an optional tailored room/time/energy setup
- One-step-at-a-time guided flow
- Foreground countdown alarm with **Stop timer** and **Add 2 minutes**
- Timer persistence across reloads and automatic pause when asking for help
- Explicit destinations for trash, recycling, donations, relocation, and no-home items
- Adaptive “I’m stuck” guidance
- Bounded repetition for unresolved items
- Safe-stop flow that closes active piles
- Active-time history, lifetime totals, room summaries, and a non-streak calendar
- Installable, offline static app shell
- Responsive, accessible controls and reduced-motion support

The alarm rings only while the page is visible and the phone is unlocked. Closing or hiding the page need not ring, and an expired timer restored later is shown as finished without autoplaying stale audio.

## Run and verify locally

There is no package manager, framework, runtime dependency, or build step.

```sh
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173/` for the app and `/tests.html` for browser checks. The deterministic Node harness uses built-in modules only:

```sh
node test-runner.mjs
```

Static production files are `index.html`, `manifest.webmanifest`, `sw.js`, and the three PNGs in `icons/`. GitHub Pages can serve them as-is.

To recover from an unwanted in-progress session, use **End this session safely** on Home and finish the bounded closing step. Browser storage can also be cleared through browser/site settings; doing so permanently removes the local active session, custom rooms, and history.

## First usability test

Recruit 5–10 people who describe themselves as overwhelmed by clutter. Ask each person to use the prototype during a real session without coaching from the maker.

Observe:

1. Do they start without needing an explanation?
2. At which step do they hesitate, leave the room, or create a pile?
3. Do the stated destinations answer their practical questions?
4. Do they use “I’m stuck,” and is the response useful?
5. Is the room measurably better—and fully closed—when they stop?
6. Would they choose to run another session later?

Do not add accounts, AI photo analysis, inventories, or subscriptions until this core behavior is repeatably useful.

## Limits

Room to Begin does not provide background/locked-phone timer guarantees, accounts, cross-device sync, analytics, Web Push, Home Assistant integration, or a native wrapper. The working title has not been cleared for trademark or domain availability.
