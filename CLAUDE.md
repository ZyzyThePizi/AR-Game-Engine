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

There are no tests or linters. Use `npx ng build` to verify that changes compile.

## Architecture

- [ar_game/src/app/app.component.ts](ar_game/src/app/app.component.ts): creates the MediaPipe `PoseLandmarker` and the canvases, and defines the menu list (`squeres`). Every frame it writes the shoulder, wrist and palm landmarks into `gameController` and forwards wrist positions to the menu while `isInMenu` is set.
- [ar_game/src/environments/environment.ts](ar_game/src/environments/environment.ts): exports `gameController`, the global mutable state shared by the menu and games (landmarks, `isInMenu`/`isInGame`, `menuController`, `score`).
- [ar_game/src/DataTypes/GameTypes.ts](ar_game/src/DataTypes/GameTypes.ts): the `GameType` enum. The enum value is the label shown in the menu.
- [ar_game/src/app/menu/Menu.ts](ar_game/src/app/menu/Menu.ts): the hand-driven menu. Hovering the center tile scrolls it, and holding over the ✔ button starts a game. `initGame()` switches on `GameType` and creates the game class.
- [ar_game/src/app/games/](ar_game/src/app/games/): one class per game (`SaveTheServer`, `FallingStar`, `PatchTheServer`), plus sprite helpers (`Sphere`, `Snowball`).
- [ar_game/src/utils/normalizationMethods.ts](ar_game/src/utils/normalizationMethods.ts): converts pixel shapes to normalized 0–1 coordinates for hit tests against landmarks.
- [ar_game/src/utils/leaderboard.ts](ar_game/src/utils/leaderboard.ts): a top-10 leaderboard stored in localStorage.
- `ar_game/src/assets/`: SVG/PNG sprites, referenced as `assets/<file>`.
- `Previous tries with python/`: legacy prototypes, not used by the app.

## Adding a game

1. Add a value to `GameType` in `GameTypes.ts`.
2. Add `{ gameType, color }` to `squeres` in `app.component.ts`.
3. Add a `case` in `Menu.initGame()` that sets `isInGame = true`, `isInMenu = false`, and `this.game = new YourGame(this.cvWidth, this.cvHeight, this.ctx)`.
4. The game class takes `(cvWidth, cvHeight, ctx)`. It draws on the top canvas and can append its own HUD canvas to `#container`.
5. When the game ends, clear the canvas and cancel any RAF loops or intervals. Then set `gameController.isInGame = false`, call `gameController.menuController.drawMenu()`, and set `menuController.game = null`.

## Conventions and gotchas

- **Mirroring:** the video is CSS-mirrored, so the landmark x must be flipped before comparing it with canvas objects: `x = (landmark.x * -1) + 1`. The y coordinate is used as-is.
- **Canvas size:** the canvas is 960×720 (`videoWidth`/`videoHeight` in `app.component.ts`). Hit tests use normalized coordinates, and a hand is usually a circle of radius `0.05`.
- **Hungarian UI:** on-screen text is Hungarian, for example "Élet", "A játéknak vége!".
- **Menu tiles:** in `Menu.ts`, `spacing = 4000` is intentional, so only the center tile is ever on screen.
- **Shoulder helper:** `getNormalizedShoulders()` mutates the shared shoulder landmarks in place.
- **Pose model:** the model and WASM load from a CDN at startup, so the app needs internet.
