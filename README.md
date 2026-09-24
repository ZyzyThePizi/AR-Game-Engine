# AR Game Engine — Kyndryl Project

A webcam-based motion-controlled AR mini-game engine, built for **Kyndryl Kutatók Éjszakája** ("Kyndryl Researchers' Night"), a Hungarian science-outreach event aimed at introducing middle schoolers to technology in a fun, hands-on way. Instead of a mouse and keyboard, players control the games with their own body movements, tracked live through a webcam — no headset, controller, or marker cards required.

The project doubles as a lightweight promotional showcase for Kyndryl, themed around IT/cybersecurity concepts (defending a "server" from "viruses", sorting "friendly" vs "non-friendly" packages) and branded with the Kyndryl logo.

## How it works

The app uses [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe) to detect the player's body position from the webcam feed in real time, directly in the browser (no app install, no native AR SDK). The tracked wrist/palm and shoulder positions are used as the player's "hitboxes" for gameplay — you play by physically moving your hands and arms in front of the camera.

## Setup / Running the project

**Requirements:**
- [Node.js](https://nodejs.org/) and npm
- A webcam
- A modern Chromium-based browser (Chrome/Edge) with WebAssembly support
- An internet connection (the pose-tracking model and runtime are loaded from a CDN at startup)

**Install and run:**

```bash
cd ar_game
npm install
npm start
```

Then open `http://localhost:4200` in your browser, click **Enable Webcam**, and grant camera permission when prompted. The game area scales to fill the window; use the **Fullscreen** button on the side for the biggest view.

**Production build:**

```bash
cd ar_game
npm run build
```

Output is generated in `ar_game/dist/`.

## How to play

**User guides with screenshots:** [English](docs/user-guide/USER_GUIDE_EN.md) · [Magyar](docs/user-guide/USER_GUIDE_HU.md)


1. Stand back far enough from the webcam that your shoulders, arms, and hands are all visible in frame, in a well-lit room.
2. Enable the webcam and wait for pose tracking to lock on — you'll see landmark dots overlaid on your video feed.
3. Pick a game from the carousel menu. Your hands show up as round cursors. To browse, swipe a hand sideways at card height, or hold a hand on one of the side cards until its ring fills. To play, hold a hand on the green **INDÍTÁS / START** button until it fills. (Operator shortcuts: ←/→ to browse, Enter to start, S for settings; a mouse click or tap also works.)
4. **Settings:** hold a hand on the gear button in the top-right corner of the menu. There you can switch the language (Magyar / English; game names stay the same) and the difficulty. The choice is remembered in the browser.

   | Difficulty | Pace | Score multiplier |
   |---|---|---|
   | Easy | slower, fewer threats | ×0.5 |
   | Medium | the original balance | ×1 |
   | Hard | faster, more threats | ×1.5 |

   The countdown before every game shows the current difficulty, and every leaderboard entry is tagged with the difficulty it was played on.
5. After a short 3-2-1 countdown, play using your hands. There is no keyboard or mouse input in-game.
6. When a game ends, the player types their name (up to 10 characters) on the on-screen keyboard by holding a hand on each key; **✓ KÉSZ / DONE** saves it (a physical keyboard or mouse also works). The run is saved to that game's top-10 leaderboard, which is stored in the browser and shown with a podium for the top 3.

### Games

**Save the Server**
Defend a central server from incoming "virus" projectiles that home in on it from the edges of the screen. Catch each virus with your palm before it reaches the server to block the attack and score points. Every virus that gets through costs you health; the game ends when your health runs out or the timer expires. Your final score rewards both your remaining health and the number of attacks you've blocked. Every 12–16 seconds a golden **stopwatch** flies across the top half of the screen; catch it for extra time (+7 / +5 / +4 s on easy / medium / hard). Once the server has lost 2 health, a green **repair kit** appears beside it for 5 seconds (sooner the more damaged it is); grab it for +2 health (+3 on easy). There are at most 3 / 2 / 1 kits per game on easy / medium / hard, and only one pickup is on screen at a time. The leaderboard ranks the final score.

**Filter the Traffic**
Packages fall from the top of the screen — some friendly, some not. Catch the friendly packages with your palms for points, but keep the non-friendly ones away from your shoulders, or you'll lose points. The shoulder zone you need to protect is outlined on screen. You have 60 seconds to rack up the highest score you can. A second package joins after 20 seconds, and a second virus after 30. Every 12–18 seconds a golden **stopwatch** falls; catch it for extra time (+7 / +5 / +4 s on easy / medium / hard). The leaderboard ranks points.

**Patch the Server**
A whack-a-mole style game. The screen shows a grid of healthy, green servers. One at a time, random servers get an outdated OS: they turn yellow, and if nobody helps, red. Hold your palm over an outdated server for 1.5 seconds to patch it back to green. A server left unpatched too long turns black and is lost for good. The game ends when 5 servers have gone black. The game speeds up over time: every 20 seconds the yellow and red phases get shorter and servers go outdated more often. From speed level 3 on, power-ups float over a healthy server for 5 seconds; touch one to use it. They appear more often as the game speeds up. **❄ Freeze** stops every yellow/red countdown for a few seconds (only offered when 3+ servers need help). **♥ Hotfix** brings the last lost server back (only when one is down, at most twice per game). There is no time limit: an average player lasts about two minutes, and a skilled player using both hands can keep going much longer. The leaderboard ranks who kept their servers alive the longest: one point per survived second, times the difficulty multiplier.

### The point of the game

All the games are built around a simple idea familiar from Kyndryl's world of IT infrastructure and security: telling the "good" traffic from the "bad" traffic, and defending what matters. It's a playful, physical way to get middle schoolers moving, engaged, and introduced to the idea of cybersecurity — while showcasing what's possible with browser-based motion tracking and no dedicated AR hardware.
