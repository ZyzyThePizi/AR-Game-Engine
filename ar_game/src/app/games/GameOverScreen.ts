import { addLeaderboardEntry, LeaderboardEntry } from "../../utils/leaderboard";
import * as gameUi from "../../utils/gameUi";
import { DwellInput, DwellTarget, eventToCanvas, Rect } from "../../utils/handInput";
import { formatMultiplier, t } from "../../utils/i18n";
import { Effects } from "../../utils/effects";
import { DIFFICULTY_COLOR, Difficulty, scoreMultiplier, settings } from "../../state/settings";
import { NameKeyboard } from "./NameKeyboard";

export interface GameOverConfig {
    ctx: any,
    cvWidth: number,
    cvHeight: number,
    gameName: string,                               // GameType value, shown untranslated
    stats: { label: string, value: string }[],      // result lines next to the score
    score: number,                                  // leaderboard value, already multiplied by the difficulty
    leaderboardKey: string                          // localStorage key, one per game
}

// End-of-game flow shared by every game: results + on-screen keyboard for the player's name ->
// top-10 leaderboard (podium for the top 3, the current run highlighted) -> back to the menu.
// Static parts are drawn once into offscreen layers, so the per-frame cost stays tiny.
export class GameOverScreen {

    private readonly NAME_IDLE_TIMEOUT_MS = 45000;     // saves automatically if nobody types for this long
    private readonly SCORE_COUNT_UP_MS = 900;
    private readonly LEADERBOARD_SHOW_MS = 10000;
    private readonly BOARD_INTRO_MS = 450;
    private readonly CONTINUE_HOLD_MS = 1000;

    private config: GameOverConfig;
    private difficulty: Difficulty = settings.difficulty;
    private phase: 'entry' | 'board' | 'done' = 'entry';
    private keyboard: NameKeyboard;
    private resultsLayer: { canvas: HTMLCanvasElement, ctx: any };
    private boardLayer: { canvas: HTMLCanvasElement, ctx: any } | null = null;
    private input: DwellInput;
    private effects = new Effects();
    private continueButton: DwellTarget = { id: "continue", rect: { x: 770, y: 20, w: 170, h: 54 }, holdMs: this.CONTINUE_HOLD_MS, pad: 12 };

    private animationId = null as number | null;
    private lastFrameTime = 0;
    private time = 0;
    private idleMs = 0;
    private lastNameLength = 0;
    private boardShownAt = 0;
    private highlight: { rect: Rect, rank: number } | null = null;

    private readonly keyListener = (event: KeyboardEvent) => this.onKeyDown(event);
    private readonly pointerListener = (event: PointerEvent) => this.onPointerDown(event);

    constructor(config: GameOverConfig) {
        this.config = config;
        this.input = new DwellInput(config.cvWidth, config.cvHeight);
        this.keyboard = new NameKeyboard(config.cvWidth, config.cvHeight, name => this.submitName(name));
        this.resultsLayer = gameUi.createLayer(config.cvWidth, config.cvHeight);
        this.renderResultsLayer();

        window.addEventListener("keydown", this.keyListener);
        window.addEventListener("pointerdown", this.pointerListener);
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(() => this.loop());
    }

    private loop(): void {
        if (this.phase === 'done') return;
        const now = performance.now();
        if (now - this.lastFrameTime < gameUi.MIN_FRAME_MS) {
            this.animationId = requestAnimationFrame(() => this.loop());
            return;
        }
        const dt = Math.min(now - this.lastFrameTime, 100);
        this.lastFrameTime = now;
        this.time += dt;

        const ctx = this.config.ctx;
        ctx.clearRect(0, 0, this.config.cvWidth, this.config.cvHeight);
        if (this.phase === 'entry') this.updateEntry(dt);
        else this.updateBoard(dt);

        // the phase may have just switched to 'done' inside the update
        if (!this.isFinished()) this.animationId = requestAnimationFrame(() => this.loop());
    }

    // --- phase 1: results + name entry ---

    private updateEntry(dt: number): void {
        this.keyboard.update(dt);
        if (this.phase !== 'entry') return;     // the keyboard just submitted

        // any typing restarts the idle timer, so the station never gets stuck
        this.idleMs = this.keyboard.name.length !== this.lastNameLength ? 0 : this.idleMs + dt;
        this.lastNameLength = this.keyboard.name.length;
        if (this.idleMs >= this.NAME_IDLE_TIMEOUT_MS) {
            this.submitName(this.keyboard.name);
            return;
        }

        const ctx = this.config.ctx;
        ctx.drawImage(this.resultsLayer.canvas, 0, 0);
        this.drawScoreCountUp(ctx);
        this.keyboard.draw(ctx);
    }

    private renderResultsLayer(): void {
        const { cvWidth, cvHeight, stats, gameName } = this.config;
        const ctx = this.resultsLayer.ctx;
        ctx.fillStyle = gameUi.GLASS.veil;
        ctx.fillRect(0, 0, cvWidth, cvHeight);

        gameUi.drawGlass(ctx, 40, 12, cvWidth - 80, 122, 22);
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = gameUi.COLORS.brand;
        ctx.font = "bold 12pt Arial";
        ctx.fillText(gameName.toUpperCase(), 72, 36);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 25pt Arial";
        ctx.fillText(t("gameOver"), 72, 70);

        ctx.font = "14pt Arial";
        let x = 72;
        stats.forEach(stat => {
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillText(stat.label, x, 110);
            x += ctx.measureText(stat.label).width + 8;
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 14pt Arial";
            ctx.fillText(stat.value, x, 110);
            x += ctx.measureText(stat.value).width + 30;
            ctx.font = "14pt Arial";
        });

        // score column
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(660, 26, 1.5, 94);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "bold 11pt Arial";
        ctx.fillText(t("finalScore").toUpperCase(), 790, 34);
        gameUi.drawChip(ctx, 790, 110, t(this.difficulty) + "  " + formatMultiplier(scoreMultiplier(this.difficulty)),
            DIFFICULTY_COLOR[this.difficulty]);
    }

    private drawScoreCountUp(ctx: any): void {
        const progress = Math.min(1, this.time / this.SCORE_COUNT_UP_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 30pt Arial";
        ctx.fillText(this.formatScore(this.config.score * eased), 790, 70);
        ctx.restore();
    }

    private submitName(rawName: string): void {
        if (this.phase !== 'entry') return;
        const entry: LeaderboardEntry = {
            name: rawName.trim() || t("anonymous"),
            score: this.config.score,
            date: Date.now(),
            difficulty: this.difficulty
        };
        const entries = addLeaderboardEntry(this.config.leaderboardKey, entry);
        this.boardLayer = gameUi.createLayer(this.config.cvWidth, this.config.cvHeight);
        this.renderBoardLayer(entries, entry);
        this.phase = 'board';
        this.boardShownAt = this.time;
        this.input.reset();
        this.celebrate();
    }

    // --- phase 2: leaderboard ---

    private updateBoard(dt: number): void {
        const ctx = this.config.ctx;
        const shownMs = this.time - this.boardShownAt;
        const fired = this.input.update(dt, [this.continueButton]);
        if (fired || shownMs >= this.LEADERBOARD_SHOW_MS) {
            this.finish();
            return;
        }

        // slide + fade in
        const intro = Math.min(1, shownMs / this.BOARD_INTRO_MS);
        const eased = 1 - Math.pow(1 - intro, 3);
        ctx.save();
        ctx.globalAlpha = eased;
        ctx.drawImage(this.boardLayer!.canvas, 0, 24 * (1 - eased));
        ctx.restore();

        if (intro >= 1) this.drawHighlight(ctx);
        this.effects.update(dt);
        this.effects.draw(ctx);
        this.drawContinueButton(ctx, shownMs);
        this.input.drawCursors(ctx, this.time);
    }

    private renderBoardLayer(entries: LeaderboardEntry[], current: LeaderboardEntry): void {
        const { cvWidth, cvHeight, gameName } = this.config;
        const ctx = this.boardLayer!.ctx;
        ctx.fillStyle = gameUi.GLASS.veil;
        ctx.fillRect(0, 0, cvWidth, cvHeight);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 28pt Arial";
        ctx.fillText(t("leaderboard"), cvWidth / 2, 42);
        ctx.fillStyle = gameUi.COLORS.brand;
        ctx.font = "bold 13pt Arial";
        ctx.fillText(gameName.toUpperCase(), cvWidth / 2, 78);

        const rank = entries.indexOf(current) + 1;      // 0 when it didn't make the top 10
        this.renderPodium(ctx, entries, rank);
        this.renderRows(ctx, entries, rank);

        // a new record gets a pulsing badge in the footer instead (see drawHighlight)
        if (rank === 1) return;
        ctx.textAlign = "center";
        ctx.font = "bold 15pt Arial";
        ctx.fillStyle = "#FFFFFF";
        const footer = rank > 0 ? t("yourRank", { rank: rank })
            : t("notInTop", { score: this.formatScore(current.score) });
        ctx.fillText(footer, cvWidth / 2, 688);
    }

    private renderPodium(ctx: any, entries: LeaderboardEntry[], currentRank: number): void {
        const bottom = 318;
        const width = 200;
        // drawn in podium order: 2nd left, 1st center, 3rd right
        const places = [
            { rank: 2, cx: 250, top: 130, medal: "#cbd5e1" },
            { rank: 1, cx: 480, top: 104, medal: "#fbbf24" },
            { rank: 3, cx: 710, top: 148, medal: "#d97706" }
        ];
        places.forEach(place => {
            const entry = entries[place.rank - 1];
            const rect = { x: place.cx - width / 2, y: place.top, w: width, h: bottom - place.top };
            gameUi.drawGlass(ctx, rect.x, rect.y, rect.w, rect.h, 20,
                entry ? gameUi.GLASS.tint : "rgba(15,23,42,0.3)");

            // medal
            const my = place.top + 34;
            ctx.beginPath();
            ctx.arc(place.cx, my, 22, 0, 2 * Math.PI);
            ctx.fillStyle = entry ? place.medal : "rgba(255,255,255,0.15)";
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "rgba(255,255,255,0.8)";
            ctx.stroke();
            ctx.fillStyle = "#1b1f24";
            ctx.font = "bold 16pt Arial";
            ctx.textAlign = "center";
            ctx.fillText(String(place.rank), place.cx, my + 1);

            ctx.fillStyle = "#FFFFFF";
            if (!entry) {
                ctx.font = "bold 16pt Arial";
                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.fillText("—", place.cx, my + 50);
                return;
            }
            ctx.font = "bold 17pt Arial";
            ctx.fillText(this.fitText(ctx, entry.name, width - 24), place.cx, my + 48);
            ctx.font = "bold 15pt Arial";
            ctx.fillStyle = place.medal;
            ctx.fillText(this.formatScore(entry.score), place.cx, my + 76);
            gameUi.drawChip(ctx, place.cx, my + 106, t(entry.difficulty), DIFFICULTY_COLOR[entry.difficulty],
                "bold 10pt Arial", 22);

            if (place.rank === currentRank) this.highlight = { rect: rect, rank: place.rank };
        });
    }

    private renderRows(ctx: any, entries: LeaderboardEntry[], currentRank: number): void {
        const x = 150;
        const w = 660;
        const rowH = 42;
        const firstY = 332;
        if (!entries.length) return;

        entries.slice(3).forEach((entry, i) => {
            const rank = i + 4;
            const y = firstY + i * (rowH + 6);
            gameUi.drawGlass(ctx, x, y, w, rowH, 12);

            ctx.textBaseline = "middle";
            const cy = y + rowH / 2 + 1;
            ctx.textAlign = "center";
            ctx.fillStyle = "rgba(255,255,255,0.6)";
            ctx.font = "bold 14pt Arial";
            ctx.fillText(String(rank), x + 30, cy);
            ctx.textAlign = "left";
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 15pt Arial";
            ctx.fillText(this.fitText(ctx, entry.name, 300), x + 62, cy);
            gameUi.drawChip(ctx, x + w - 210, cy, t(entry.difficulty), DIFFICULTY_COLOR[entry.difficulty],
                "bold 10pt Arial", 22);
            ctx.textAlign = "right";
            ctx.font = "bold 15pt Arial";
            ctx.fillText(this.formatScore(entry.score), x + w - 22, cy);

            if (rank === currentRank) this.highlight = { rect: { x: x, y: y, w: w, h: rowH }, rank: rank };
        });
    }

    // pulsing outline around the player's own result, plus a badge for a new record
    private drawHighlight(ctx: any): void {
        if (!this.highlight) return;
        const { x, y, w, h } = this.highlight.rect;
        const pulse = 0.5 + 0.5 * Math.sin(this.time / 220);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - 4, y - 4, w + 8, h + 8, [this.highlight.rank <= 3 ? 24 : 16]);
        ctx.lineWidth = 3 + 2 * pulse;
        ctx.strokeStyle = gameUi.COLORS.brand;
        ctx.stroke();
        ctx.restore();

        if (this.highlight.rank === 1) {
            const scale = 1 + 0.06 * pulse;
            ctx.save();
            ctx.translate(this.config.cvWidth / 2, 686);
            ctx.scale(scale, scale);
            gameUi.drawChip(ctx, 0, 0, "★ " + t("newRecord") + "  " + t("yourRank", { rank: 1 }),
                gameUi.COLORS.brand, "bold 14pt Arial", 36);
            ctx.restore();
        }
    }

    private drawContinueButton(ctx: any, shownMs: number): void {
        const { x, y, w, h } = this.continueButton.rect;
        const progress = this.input.progressOf(this.continueButton);
        gameUi.drawGlass(ctx, x, y, w, h, h / 2, "rgba(15,23,42,0.6)",
            this.input.isHovered(this.continueButton.id) ? "#FFFFFF" : gameUi.GLASS.border);

        ctx.save();
        // hold progress fills the pill; the thin bar underneath shows the automatic return
        if (progress > 0) {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, [h / 2]);
            ctx.clip();
            ctx.fillStyle = "rgba(141,182,0,0.8)";
            ctx.fillRect(x, y, w * progress, h);
        }
        ctx.restore();

        ctx.save();
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 15pt Arial";
        ctx.fillText(t("continue"), x + w / 2, y + h / 2 + 1);
        const remaining = 1 - shownMs / this.LEADERBOARD_SHOW_MS;
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(x + 20, y + h + 8, w - 40, 3);
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(x + 20, y + h + 8, (w - 40) * remaining, 3);
        ctx.restore();
    }

    private celebrate(): void {
        if (!this.highlight || this.highlight.rank > 3) return;
        const { x, y, w } = this.highlight.rect;
        ["#fbbf24", gameUi.COLORS.brand, "#22c55e", "#3b82f6"].forEach(color =>
            this.effects.burst(x + w / 2, y + 20, color, 12));
    }

    // --- input ---

    private onKeyDown(event: KeyboardEvent): void {
        if (this.phase === 'entry') this.keyboard.onKeyDown(event);
        else if (this.phase === 'board' && event.key === "Enter") this.finish();
    }

    private onPointerDown(event: PointerEvent): void {
        const point = eventToCanvas(event, this.config.ctx.canvas, this.config.cvWidth, this.config.cvHeight);
        if (!point) return;
        if (this.phase === 'entry') {
            this.keyboard.pressAt(point.x, point.y);
        } else if (this.phase === 'board') {
            const { x, y, w, h } = this.continueButton.rect;
            if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) this.finish();
        }
    }

    private isFinished(): boolean {
        return this.phase === 'done';
    }

    private finish(): void {
        if (this.phase === 'done') return;
        this.phase = 'done';
        cancelAnimationFrame(this.animationId as number);
        window.removeEventListener("keydown", this.keyListener);
        window.removeEventListener("pointerdown", this.pointerListener);
        this.effects.clear();
        gameUi.returnToMenu(this.config.ctx, this.config.cvWidth, this.config.cvHeight);
    }

    // --- helpers ---

    private formatScore(score: number): string {
        return Math.round(score).toLocaleString(settings.language === 'hu' ? "hu-HU" : "en-US") + " " + t("points");
    }

    private fitText(ctx: any, text: string, maxWidth: number): string {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let cut = text;
        while (cut.length > 1 && ctx.measureText(cut + "…").width > maxWidth) cut = cut.slice(0, -1);
        return cut + "…";
    }
}
