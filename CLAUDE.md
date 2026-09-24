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

There are no tests or linters. Use `npx ng build --configuration development` (or `npx ng build` for production) to verify that changes compile. The production build only warns about the 500 kB bundle budget.

## Architecture

- [ar_game/src/app/app.component.ts](ar_game/src/app/app.component.ts): creates the MediaPipe `PoseLandmarker` and the canvases, and defines the menu list (`squeres`). Every frame it writes the shoulder, wrist and palm landmarks into `gameController`. It also scales `#container` with a CSS transform to fill the window, next to the Kyndryl logo column.
- [ar_game/src/state/gameController.ts](ar_game/src/state/gameController.ts): `gameController`, the global mutable state shared by the menu and games (landmarks, `isInMenu`/`isInGame`, `menuController`, `score`).
- [ar_game/src/state/settings.ts](ar_game/src/state/settings.ts): language (`hu`/`en`) and difficulty (`easy`/`medium`/`hard`), persisted in localStorage. `byDifficulty({ easy, medium, hard })` picks a tuning value; `scoreMultiplier()` is ×0.5 / ×1 / ×1.5. Medium is the original balance.
- [ar_game/src/utils/i18n.ts](ar_game/src/utils/i18n.ts): every on-screen text in both languages; use `t("key")`. Game names (`GameType` values) are never translated.
- [ar_game/src/DataTypes/GameTypes.ts](ar_game/src/DataTypes/GameTypes.ts): the `GameType` enum. The enum value is the label shown in the menu.
- [ar_game/src/app/menu/Menu.ts](ar_game/src/app/menu/Menu.ts): the hand-driven carousel menu. It runs its own RAF loop while open (started by `drawMenu()`) and reads the hands from `gameController`. A sideways swipe, or holding on a side card, scrolls it. Holding on the INDÍTÁS button starts a game. The gear pill (top right) opens [SettingsPanel.ts](ar_game/src/app/menu/SettingsPanel.ts). `initGame()` stops the loop, switches on `GameType` and creates the game class.
- [ar_game/src/app/games/](ar_game/src/app/games/): one class per game (`SaveTheServer`, `FilterTheTraffic`, `PatchTheServer`). Each runs a single RAF loop with delta time. `GameOverScreen` is the shared end flow: results, the hand-typed on-screen keyboard (`NameKeyboard`, max 10 characters), a top-10 leaderboard with a podium, then back to the menu.
- [ar_game/src/utils/normalizationMethods.ts](ar_game/src/utils/normalizationMethods.ts): converts pixel shapes to normalized 0–1 coordinates for hit tests against landmarks.
- [ar_game/src/utils/leaderboard.ts](ar_game/src/utils/leaderboard.ts): a top-10 leaderboard stored in localStorage, with one key per game, ranked by `score` (higher is better).
- [ar_game/src/utils/gameUi.ts](ar_game/src/utils/gameUi.ts): the shared look: HUD canvas and stat boxes, panels, hand markers, the 3-2-1 countdown and `returnToMenu()`.
- [ar_game/src/utils/effects.ts](ar_game/src/utils/effects.ts): particle bursts and floating "+100" texts.
- [ar_game/src/utils/sprites.ts](ar_game/src/utils/sprites.ts): bitmap cache. `imageSprite` rasterizes an SVG once per size, `glowSprite` bakes a shadowBlur glow once (fade it with `globalAlpha`), `cachedDrawing` caches any drawing by key.
- [ar_game/src/utils/powerUps.ts](ar_game/src/utils/powerUps.ts): `PowerUpArt`, the shared glowing pickup bubbles (stopwatch, freeze, hotfix, repair kit) with a lifetime ring that blinks before expiry. Each game owns its pickup logic.
- [ar_game/src/utils/handInput.ts](ar_game/src/utils/handInput.ts): `DwellInput` (hold-a-hand-on-it buttons with smoothed cursors) and `eventToCanvas` for mouse/touch, used by the keyboard, leaderboard, settings and menu. It points with `gameController.leftPalm/rightPalm`, smooths them with a 1€ filter, keeps focus sticky at key edges, and leaves a hand that was already on screen when the screen opened unarmed until it moves ~60 px.
- `ar_game/src/assets/`: SVG/PNG sprites, referenced as `assets/<file>`.
- `Previous tries with python/`: legacy prototypes, not used by the app.

## Adding a game

1. Add a value to `GameType` in `GameTypes.ts`.
2. Add `{ gameType, color, icon, badge?, description }` to `squeres` in `app.component.ts`. `icon` and `badge` are asset paths, and `description` is `{ hu, en }`, one short sentence per language for the menu card.
3. Add a `case` in `Menu.initGame()` that sets `this.game = new YourGame(this.cvWidth, this.cvHeight, this.ctx)`.
4. The game class takes `(cvWidth, cvHeight, ctx)`. It draws on the top canvas, and can add a HUD canvas with `gameUi.createHudCanvas()`. For a consistent look, use `gameUi` (stat boxes, hand markers, `COUNTDOWN_MS` and `drawCountdown`) and `Effects`. Put all text through `t()` and pick the tuning with `byDifficulty()` (medium = the base values).
5. When the game ends, cancel the RAF loop, remove the HUD canvas, and create a `new GameOverScreen({...})` with the `gameName`, the result `stats`, the score (already multiplied by `scoreMultiplier()`) and a new `leaderboardKey`. It returns to the menu by itself. A game without a leaderboard calls `gameUi.returnToMenu()` instead.

## Conventions and gotchas

- **Hand points:** `leftPalm`/`rightPalm` are not MediaPipe finger landmarks. `AppComponent.handPoint` estimates them along the forearm (`wrist + 0.35 × (wrist − elbow)`), because the pose model's pinky/index/thumb points are unreliable when a hand is held edge-on, pointed or closed. They are null while the hand is out of frame.
- **Mirroring:** the video is CSS-mirrored, so the landmark x must be flipped before comparing it with canvas objects: `x = (landmark.x * -1) + 1`. The y coordinate is used as-is.
- **Canvas size:** the game world is always 960×720 (`videoWidth`/`videoHeight` in `app.component.ts`), and CSS scales it on screen. Always work in these canvas pixels. HTML overlays go inside `#container`, so they scale with it. Hit tests use normalized coordinates, and a hand is usually a circle of radius `0.05`.
- **Bilingual UI:** on-screen text is Hungarian or English, chosen in the settings. Add new strings to both languages in `i18n.ts`.
- **Low-end PCs:** never animate `shadowBlur` per frame or use CSS `backdrop-filter`; bake glows with `glowSprite`/`cachedDrawing` and draw SVGs through `imageSprite`. The "glass" look is `gameUi.drawGlass`. Draw static screens once into a `gameUi.createLayer()` canvas, redraw the HUD only when its values change (see the games' `hudKey`), and start every RAF loop with the `gameUi.MIN_FRAME_MS` check (caps high-refresh screens at ~60-70 fps).
- **Pose model:** the model and WASM load from a CDN at startup, so the app needs internet.
