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

Then open `http://localhost:4200` in your browser, click **Enable Webcam**, and grant camera permission when prompted.

**Production build:**

```bash
cd ar_game
npm run build
```

Output is generated in `ar_game/dist/`.

## How to play

1. Stand back far enough from the webcam that your shoulders, arms, and hands are all visible in frame, in a well-lit room.
2. Enable the webcam and wait for pose tracking to lock on — you'll see landmark dots overlaid on your video feed.
3. Navigate the menu by moving your hand into the left/right edge zones to scroll between games, then hold your hand over the checkmark button to select one.
4. Play using your hands — there is no keyboard or mouse input in-game.

### Games

**Save the Server**
Defend a central server from incoming "virus" projectiles that home in on it from the edges of the screen. Catch each virus with your palm before it reaches the server to block the attack and score points. Every virus that gets through costs you health; the game ends when your health runs out or the timer expires. Your final score rewards both your remaining health and the number of attacks you've blocked.

**Falling Star**
Packages fall from the top of the screen — some friendly, some not. Catch the friendly packages with your palms for points, but keep the non-friendly ones away from your shoulders, or you'll lose points. You have 60 seconds to rack up the highest score you can.

### The point of the game

Both games are built around a simple idea familiar from Kyndryl's world of IT infrastructure and security: telling the "good" traffic from the "bad" traffic, and defending what matters. It's a playful, physical way to get middle schoolers moving, engaged, and introduced to the idea of cybersecurity — while showcasing what's possible with browser-based motion tracking and no dedicated AR hardware.
