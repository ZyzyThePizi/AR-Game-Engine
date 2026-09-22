# CLAUDE.md

Webcam-based, motion-controlled AR mini-game engine built for **Kyndryl Kutatók Éjszakája** (a Hungarian science-outreach event for middle schoolers). Players control the games with their hands. MediaPipe Pose tracks them in the browser, with no controller or AR hardware.

**See [README.md](README.md)** for the full project description, setup, how to play, and the game descriptions. Keep the README's "Games" section updated when you add or change a game.

## Commands

All app code lives in `ar_game/` (Angular 14, TypeScript 4.7).

```bash
cd ar_game
npm install
npm start        # ng serve -> http://localhost:4200
npm run build    # production build -> ar_game/dist/
```

There are no tests or linters. Use `npx ng build --configuration development` to verify that changes compile. The default production build currently fails, because `environment.prod.ts` does not export `gameController`.

## Architecture

- [ar_game/src/app/app.component.ts](ar_game/src/app/app.component.ts): creates the MediaPipe `PoseLandmarker` and the canvases, and defines the menu list (`squeres`). Every frame it writes the shoulder, wrist and palm landmarks into `gameController`. It also scales `#container` with a CSS transform to fill the window, next to the Kyndryl logo column.
- [ar_game/src/environments/environment.ts](ar_game/src/environments/environment.ts): exports `gameController`, the global mutable state shared by the menu and games (landmarks, `isInMenu`/`isInGame`, `menuController`, `score`).
- [ar_game/src/DataTypes/GameTypes.ts](ar_game/src/DataTypes/GameTypes.ts): the `GameType` enum. The enum value is the label shown in the menu.
- [ar_game/src/app/menu/Menu.ts](ar_game/src/app/menu/Menu.ts): the hand-driven carousel menu. It runs its own RAF loop while open (started by `drawMenu()`) and reads the hands from `gameController`. A sideways swipe, or holding on a side card, scrolls it. Holding on the INDÍTÁS button starts a game. `initGame()` stops the loop, switches on `GameType` and creates the game class.
- [ar_game/src/app/games/](ar_game/src/app/games/): one class per game (`SaveTheServer`, `FilterTheTraffic`, `PatchTheServer`). Each runs a single RAF loop with delta time. `GameOverScreen` is the shared end flow: the results panel, the name input, a top-10 leaderboard, then back to the menu.
- [ar_game/src/utils/normalizationMethods.ts](ar_game/src/utils/normalizationMethods.ts): converts pixel shapes to normalized 0–1 coordinates for hit tests against landmarks.
- [ar_game/src/utils/leaderboard.ts](ar_game/src/utils/leaderboard.ts): a top-10 leaderboard stored in localStorage, with one key per game, ranked by `score` (higher is better).
- [ar_game/src/utils/gameUi.ts](ar_game/src/utils/gameUi.ts): the shared look: HUD canvas and stat boxes, panels, hand markers, the 3-2-1 countdown and `returnToMenu()`.
- [ar_game/src/utils/effects.ts](ar_game/src/utils/effects.ts): particle bursts and floating "+100" texts.
- `ar_game/src/assets/`: SVG/PNG sprites, referenced as `assets/<file>`.
- `Previous tries with python/`: legacy prototypes, not used by the app.

## Adding a game

1. Add a value to `GameType` in `GameTypes.ts`.
2. Add `{ gameType, color, icon, badge?, description }` to `squeres` in `app.component.ts`. `icon` and `badge` are asset paths, and `description` is one short Hungarian sentence for the menu card.
3. Add a `case` in `Menu.initGame()` that sets `this.game = new YourGame(this.cvWidth, this.cvHeight, this.ctx)`.
4. The game class takes `(cvWidth, cvHeight, ctx)`. It draws on the top canvas, and can add a HUD canvas with `gameUi.createHudCanvas()`. For a consistent look, use `gameUi` (stat boxes, hand markers, `COUNTDOWN_MS` and `drawCountdown`) and `Effects`.
5. When the game ends, cancel the RAF loop, remove the HUD canvas, and create a `new GameOverScreen({...})` with the result lines, the score and a new `leaderboardKey`. It returns to the menu by itself. A game without a leaderboard calls `gameUi.returnToMenu()` instead.

## Conventions and gotchas

- **Mirroring:** the video is CSS-mirrored, so the landmark x must be flipped before comparing it with canvas objects: `x = (landmark.x * -1) + 1`. The y coordinate is used as-is.
- **Canvas size:** the game world is always 960×720 (`videoWidth`/`videoHeight` in `app.component.ts`), and CSS scales it on screen. Always work in these canvas pixels. HTML overlays go inside `#container`, so they scale with it. Hit tests use normalized coordinates, and a hand is usually a circle of radius `0.05`.
- **Hungarian UI:** on-screen text is Hungarian, for example "Élet", "A játéknak vége!".
- **Pose model:** the model and WASM load from a CDN at startup, so the app needs internet.
