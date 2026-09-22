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

1. Stand back far enough from the webcam that your shoulders, arms, and hands are all visible in frame, in a well-lit room.
2. Enable the webcam and wait for pose tracking to lock on — you'll see landmark dots overlaid on your video feed.
3. Pick a game from the carousel menu. Your hands show up as round cursors. To browse, swipe a hand sideways at card height, or hold a hand on one of the side cards until its ring fills. To play, hold a hand on the green **INDÍTÁS** button until it fills. (Operator shortcut: ←/→ to browse, Enter to start.)
4. After a short 3-2-1 countdown, play using your hands. There is no keyboard or mouse input in-game.
5. When a game ends, the operator types the player's name. The run is saved to that game's top-10 leaderboard, which is stored in the browser.

### Games

**Save the Server**
Defend a central server from incoming "virus" projectiles that home in on it from the edges of the screen. Catch each virus with your palm before it reaches the server to block the attack and score points. Every virus that gets through costs you health; the game ends when your health runs out or the timer expires. Your final score rewards both your remaining health and the number of attacks you've blocked. The leaderboard ranks the final score.

**Filter the Traffic**
Packages fall from the top of the screen — some friendly, some not. Catch the friendly packages with your palms for points, but keep the non-friendly ones away from your shoulders, or you'll lose points. The shoulder zone you need to protect is outlined on screen. You have 60 seconds to rack up the highest score you can. A second package joins after 20 seconds, and a second virus after 30. The leaderboard ranks points.

**Patch the Server**
A whack-a-mole style game. The screen shows a grid of healthy, green servers. One at a time, random servers get an outdated OS: they turn yellow, and if nobody helps, red. Hold your palm over an outdated server for 1.5 seconds to patch it back to green. A server left unpatched too long turns black and is lost for good. The game ends when 5 servers have gone black. The game speeds up over time: every 20 seconds the yellow and red phases get shorter and servers go outdated more often. There is no time limit: an average player lasts about two minutes, and a skilled player using both hands can keep going much longer. The leaderboard ranks who kept their servers alive the longest.

### The point of the game

All the games are built around a simple idea familiar from Kyndryl's world of IT infrastructure and security: telling the "good" traffic from the "bad" traffic, and defending what matters. It's a playful, physical way to get middle schoolers moving, engaged, and introduced to the idea of cybersecurity — while showcasing what's possible with browser-based motion tracking and no dedicated AR hardware.
