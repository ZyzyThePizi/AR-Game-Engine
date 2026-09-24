import { gameController } from "../../state/gameController";
import { ObjectCoordinates } from "../../interfaces/ObjectCoordinates";
import * as normalizationUtils from "../../utils/normalizationMethods";
import { Effects } from "../../utils/effects";
import * as gameUi from "../../utils/gameUi";
import { GameOverScreen } from "./GameOverScreen";
import { byDifficulty, scoreMultiplier } from "../../state/settings";
import { GameType } from "../../DataTypes/GameTypes";
import { t } from "../../utils/i18n";
import { PowerUpArt, PowerUpKind, POWER_UP_COLORS } from "../../utils/powerUps";
import { imageSprite } from "../../utils/sprites";

type ServerState = 'healthy' | 'outdated' | 'critical' | 'dead';

interface PowerUp { kind: PowerUpKind, x: number, y: number, bornMs: number }

interface ServerCell {
    state: ServerState,
    stateSince: number,     // elapsed game ms when the current state started
    yellowMs: number,       // phase lengths locked in when the server became outdated
    redMs: number,
    patchProgressMs: number,
    x: number,
    y: number,
    w: number,
    h: number
}

export class PatchTheServer {

    // --- tuning (medium = the original balance) ---
    private readonly GRID_COLS = 5;
    private readonly GRID_ROWS = 3;
    private readonly INITIAL_YELLOW_MS = byDifficulty({ easy: 6500, medium: 5000, hard: 4000 });
    private readonly INITIAL_RED_MS = byDifficulty({ easy: 6500, medium: 5000, hard: 4000 });
    private readonly MIN_PHASE_MS = byDifficulty({ easy: 2000, medium: 1500, hard: 1200 });
    private readonly PATCH_HOLD_MS = byDifficulty({ easy: 1200, medium: 1500, hard: 1700 });
    private readonly MAX_DEAD = 5;
    // gentle ramp: a typical player lasts ~2 minutes, a skilled two-handed one ~4. There is no time limit;
    // the MIN_* floors keep it beatable only for so long, since outdating eventually outpaces two hands.
    private readonly SPEEDUP_EVERY_MS = 20000;
    private readonly SPEEDUP_FACTOR = 0.91;
    private readonly OUTDATE_INTERVAL_MS = byDifficulty({ easy: 3000, medium: 2500, hard: 2100 });
    private readonly MIN_OUTDATE_INTERVAL_MS = 700;
    private readonly HAND_RADIUS = 0.05;
    private readonly LEADERBOARD_KEY = "patchTheServerLeaderboard";
    private readonly SCORE_MULTIPLIER = scoreMultiplier();
    // power-ups follow the pace: none while it is calm, then more often the faster it gets.
    // Freeze is only offered when several servers need help, Hotfix only when one is down and
    // at most MAX_HOTFIXES times, so they stretch a good run without making it endless.
    private readonly POWERUP_FIRST_LEVEL = 2;                 // from speed 3 on the HUD (after 40 s)
    private readonly POWERUP_INTERVAL_MS = byDifficulty({ easy: 26000, medium: 30000, hard: 34000 });
    private readonly POWERUP_INTERVAL_STEP_MS = 3000;         // shorter by this for every further speed level
    private readonly POWERUP_MIN_INTERVAL_MS = 14000;
    private readonly POWERUP_LIFETIME_MS = 5000;
    private readonly POWERUP_RADIUS = 36;
    private readonly FREEZE_MS = byDifficulty({ easy: 6000, medium: 5000, hard: 4000 });
    private readonly FREEZE_MIN_THREATS = 3;                  // outdated + critical servers
    private readonly MAX_HOTFIXES = 2;

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private hudCanvas: HTMLCanvasElement;
    private hudCtx: any;
    private effects = new Effects();

    private servers: ServerCell[] = [];
    private images: Record<ServerState, HTMLImageElement>;
    private wrenchImage: HTMLImageElement;

    private animationId = null as number | null;
    private lastFrameTime = 0;
    private countdownMs = gameUi.COUNTDOWN_MS;
    private elapsedMs = 0;
    private sinceLastOutdateMs = 0;
    private patchedCount = 0;
    private deadCount = 0;
    private ended = false;
    private powerUpArt = new PowerUpArt(['freeze', 'hotfix']);
    private powerUp: PowerUp | null = null;
    private sincePowerUpMs = 0;
    private freezeMs = 0;
    private hotfixesUsed = 0;
    private hudKey = "";

    constructor(cvWidth: number, cvHeight: number, ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;

        this.hudCanvas = gameUi.createHudCanvas(this.cvWidth, this.cvHeight);
        this.hudCtx = this.hudCanvas.getContext("2d")!;

        this.images = {
            healthy: this.loadImage('assets/patchServerHealthy.svg'),
            outdated: this.loadImage('assets/patchServerOutdated.svg'),
            critical: this.loadImage('assets/patchServerCritical.svg'),
            dead: this.loadImage('assets/patchServerDead.svg')
        };
        this.wrenchImage = this.loadImage('assets/patchWrench.svg');

        this.initGame();
    }

    private loadImage(src: string): HTMLImageElement {
        const image = new Image();
        image.src = src;
        return image;
    }

    private initGame(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        gameController.score = 0;
        this.createGrid();
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    private createGrid(): void {
        const top = this.hudCanvas.height + 10;
        const bottom = this.cvHeight - 10;
        const left = 20;
        const right = this.cvWidth - 20;
        const cellW = (right - left) / this.GRID_COLS;
        const cellH = (bottom - top) / this.GRID_ROWS;

        // keep the sprite's 160:170 aspect ratio, leave room for the countdown bar
        const h = Math.min(cellH - 30, (cellW - 20) * 170 / 160);
        const w = h * 160 / 170;

        this.servers = [];
        for (let row = 0; row < this.GRID_ROWS; row++) {
            for (let col = 0; col < this.GRID_COLS; col++) {
                this.servers.push({
                    state: 'healthy',
                    stateSince: 0,
                    yellowMs: this.INITIAL_YELLOW_MS,
                    redMs: this.INITIAL_RED_MS,
                    patchProgressMs: 0,
                    x: left + col * cellW + (cellW - w) / 2,
                    y: top + row * cellH + (cellH - 30 - h) / 2,
                    w: w,
                    h: h
                });
            }
        }
    }

    private gameLoop(): void {
        if (this.ended) return;

        const now = performance.now();
        if (now - this.lastFrameTime < gameUi.MIN_FRAME_MS) {
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }
        // cap the step so a hidden tab doesn't kill every server at once
        const dt = Math.min(now - this.lastFrameTime, 250);
        this.lastFrameTime = now;

        if (this.countdownMs > 0) {
            this.countdownMs -= dt;
            this.drawServers();
            this.drawHud();
            gameUi.drawCountdown(this.ctx, this.cvWidth, this.cvHeight, Math.max(0, this.countdownMs));
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        this.elapsedMs += dt;
        if (this.freezeMs > 0) {
            this.freezeMs = Math.max(0, this.freezeMs - dt);
            this.holdCountdowns(dt);
        } else {
            this.outdateRandomServer(dt);
        }
        this.updateStates();
        this.updatePatching(dt);
        this.updatePowerUp(dt);
        this.effects.update(dt);
        this.drawServers();
        this.drawPowerUp();
        this.effects.draw(this.ctx);
        gameUi.drawHandMarkers(this.ctx, this.cvWidth, this.cvHeight, this.elapsedMs);
        this.drawHud();

        if (this.deadCount >= this.MAX_DEAD) {
            this.endGame();
            return;
        }

        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    private get speedLevel(): number {
        return Math.floor(this.elapsedMs / this.SPEEDUP_EVERY_MS);
    }

    private scaled(baseMs: number, minMs: number): number {
        return Math.max(minMs, baseMs * Math.pow(this.SPEEDUP_FACTOR, this.speedLevel));
    }

    private outdateRandomServer(dt: number): void {
        this.sinceLastOutdateMs += dt;
        if (this.sinceLastOutdateMs < this.scaled(this.OUTDATE_INTERVAL_MS, this.MIN_OUTDATE_INTERVAL_MS)) return;
        this.sinceLastOutdateMs = 0;

        const healthy = this.servers.filter(server => server.state === 'healthy');
        if (!healthy.length) return;

        const server = healthy[Math.floor(Math.random() * healthy.length)];
        server.yellowMs = this.scaled(this.INITIAL_YELLOW_MS, this.MIN_PHASE_MS);
        server.redMs = this.scaled(this.INITIAL_RED_MS, this.MIN_PHASE_MS);
        this.setState(server, 'outdated');
    }

    private updateStates(): void {
        this.servers.forEach(server => {
            const inState = this.elapsedMs - server.stateSince;
            if (server.state === 'outdated' && inState >= server.yellowMs) {
                this.setState(server, 'critical');
            } else if (server.state === 'critical' && inState >= server.redMs) {
                this.setState(server, 'dead');
                server.patchProgressMs = 0;
                this.deadCount++;
                this.effects.burst(server.x + server.w / 2, server.y + server.h / 2, "#333333", 24);
                this.effects.floatText(server.x + server.w / 2, server.y, t("serverDown"), gameUi.COLORS.danger);
            }
        });
    }

    private updatePatching(dt: number): void {
        const hands: ObjectCoordinates[] = [];
        [gameController.leftPalm, gameController.rightPalm].forEach(palm => {
            if (palm) {
                hands.push(normalizationUtils.getNormalizedHandCircle((palm.x * -1) + 1, palm.y, this.HAND_RADIUS));
            }
        });

        this.servers.forEach(server => {
            if (server.state !== 'outdated' && server.state !== 'critical') return;

            const serverRect = this.getNormalizedRect(server);
            const isHandOver = hands.some(hand => this.isCircleOverlapWithRectangle(hand, serverRect));

            if (!isHandOver) {
                server.patchProgressMs = 0;
                return;
            }

            server.patchProgressMs += dt;
            if (server.patchProgressMs >= this.PATCH_HOLD_MS) {
                server.patchProgressMs = 0;
                this.setState(server, 'healthy');
                this.patchedCount++;
                this.effects.burst(server.x + server.w / 2, server.y + server.h / 2, "#22c55e");
                this.effects.floatText(server.x + server.w / 2, server.y, t("serverPatched"), "#22c55e");
            }
        });
    }

    // --- power-ups ---

    // Freeze: the yellow/red countdowns stand still (the game clock and speed-up keep running)
    private holdCountdowns(dt: number): void {
        this.servers.forEach(server => {
            if (server.state === 'outdated' || server.state === 'critical') server.stateSince += dt;
        });
    }

    private get powerUpInterval(): number {
        const steps = Math.max(0, this.speedLevel - this.POWERUP_FIRST_LEVEL);
        return Math.max(this.POWERUP_MIN_INTERVAL_MS, this.POWERUP_INTERVAL_MS - steps * this.POWERUP_INTERVAL_STEP_MS);
    }

    private updatePowerUp(dt: number): void {
        if (this.powerUp) {
            const powerUp = this.powerUp;
            if (this.isHandOnPowerUp(powerUp)) {
                this.powerUp = null;
                this.applyPowerUp(powerUp);
            } else if (this.elapsedMs - powerUp.bornMs >= this.POWERUP_LIFETIME_MS) {
                this.powerUp = null;
            }
            return;
        }
        if (this.speedLevel < this.POWERUP_FIRST_LEVEL || this.freezeMs > 0) return;

        this.sincePowerUpMs += dt;
        if (this.sincePowerUpMs < this.powerUpInterval) return;
        const kind = this.choosePowerUp();
        if (!kind) return;      // nothing would help right now: offer one as soon as something would

        // floats over a healthy server, so reaching for it never blocks a patch
        const healthy = this.servers.filter(server => server.state === 'healthy');
        const host = healthy.length ? healthy[Math.floor(Math.random() * healthy.length)] : null;
        this.powerUp = {
            kind: kind,
            x: host ? host.x + host.w / 2 : this.cvWidth / 2,
            y: host ? host.y + host.h / 2 : this.cvHeight / 2,
            bornMs: this.elapsedMs
        };
        this.sincePowerUpMs = 0;
    }

    private choosePowerUp(): PowerUpKind | null {
        const threats = this.servers.filter(server => server.state === 'outdated' || server.state === 'critical').length;
        const canHotfix = this.deadCount > 0 && this.hotfixesUsed < this.MAX_HOTFIXES;
        if (canHotfix && this.deadCount >= this.MAX_DEAD - 2) return 'hotfix';     // close to game over
        if (threats >= this.FREEZE_MIN_THREATS) return 'freeze';
        return canHotfix ? 'hotfix' : null;
    }

    private isHandOnPowerUp(powerUp: PowerUp): boolean {
        return [gameController.leftPalm, gameController.rightPalm].some(palm => {
            if (!palm) return false;
            const dx = powerUp.x / this.cvWidth - ((palm.x * -1) + 1);
            const dy = (powerUp.y / this.cvHeight - palm.y) * this.cvHeight / this.cvWidth;
            return Math.sqrt(dx * dx + dy * dy) < this.POWERUP_RADIUS / this.cvWidth + this.HAND_RADIUS;
        });
    }

    private applyPowerUp(powerUp: PowerUp): void {
        const color = POWER_UP_COLORS[powerUp.kind];
        this.effects.burst(powerUp.x, powerUp.y, color, 26);
        if (powerUp.kind === 'freeze') {
            this.freezeMs = this.FREEZE_MS;
            this.effects.floatText(powerUp.x, powerUp.y - 45, t("freezeText"), color);
            return;
        }
        // hotfix: the server that went down last comes back
        const dead = this.servers.filter(server => server.state === 'dead')
            .sort((a, b) => b.stateSince - a.stateSince)[0];
        if (!dead) return;
        this.setState(dead, 'healthy');
        this.deadCount--;
        this.hotfixesUsed++;
        this.effects.burst(dead.x + dead.w / 2, dead.y + dead.h / 2, color, 26);
        this.effects.floatText(dead.x + dead.w / 2, dead.y, t("hotfixText"), color);
    }

    private drawPowerUp(): void {
        this.drawFreezeFrame();
        if (!this.powerUp) return;
        const lifeLeft = 1 - (this.elapsedMs - this.powerUp.bornMs) / this.POWERUP_LIFETIME_MS;
        this.powerUpArt.draw(this.ctx, this.powerUp.kind, this.powerUp.x, this.powerUp.y, this.POWERUP_RADIUS,
            this.elapsedMs, lifeLeft);
    }

    private setState(server: ServerCell, state: ServerState): void {
        server.state = state;
        server.stateSince = this.elapsedMs;
    }

    private getNormalizedRect(server: ServerCell): ObjectCoordinates {
        return {
            min: { x: server.x / this.cvWidth, y: server.y / this.cvHeight },
            max: { x: (server.x + server.w) / this.cvWidth, y: (server.y + server.h) / this.cvHeight },
            center: { x: (server.x + server.w / 2) / this.cvWidth, y: (server.y + server.h / 2) / this.cvHeight }
        };
    }

    private isCircleOverlapWithRectangle(circle: ObjectCoordinates, rect: ObjectCoordinates): boolean {
        const radius = circle.max.x - circle.center.x;
        const closestX = Math.max(rect.min.x, Math.min(circle.center.x, rect.max.x));
        const closestY = Math.max(rect.min.y, Math.min(circle.center.y, rect.max.y));
        const dx = circle.center.x - closestX;
        const dy = circle.center.y - closestY;
        return (dx * dx + dy * dy) < (radius * radius);
    }

    private drawServers(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);

        this.servers.forEach(server => {
            this.ctx.globalAlpha = server.state === 'dead' ? 0.9 : 0.8;
            const sprite = imageSprite(this.images[server.state], server.w, server.h);
            if (sprite) {
                this.ctx.drawImage(sprite.canvas, server.x, server.y);
            } else {
                this.ctx.fillStyle = this.stateColor(server.state);
                this.ctx.fillRect(server.x, server.y, server.w, server.h);
            }
            this.ctx.globalAlpha = 1.0;

            if (server.state === 'outdated' || server.state === 'critical') {
                if (this.freezeMs > 0) {
                    this.ctx.beginPath();
                    this.ctx.roundRect(server.x, server.y, server.w, server.h, [10]);
                    this.ctx.fillStyle = "rgba(56,189,248,0.35)";
                    this.ctx.fill();
                }
                this.drawCountdownBar(server);
            }
            if (server.patchProgressMs > 0) {
                this.drawPatchProgress(server);
            }
        });
    }

    // frosty frame around the screen while Freeze holds the countdowns
    private drawFreezeFrame(): void {
        if (this.freezeMs <= 0) return;
        const ctx = this.ctx;
        const fade = Math.min(1, this.freezeMs / 600);      // melts away at the end
        ctx.save();
        ctx.globalAlpha = fade * (0.55 + 0.15 * Math.sin(this.elapsedMs / 200));
        ctx.lineWidth = 16;
        ctx.strokeStyle = POWER_UP_COLORS.freeze;
        ctx.strokeRect(8, 8, this.cvWidth - 16, this.cvHeight - 16);
        ctx.restore();
    }

    private stateColor(state: ServerState): string {
        switch (state) {
            case 'healthy': return "#1f9d55";
            case 'outdated': return "#e0a800";
            case 'critical': return "#d62828";
            case 'dead': return "#111111";
        }
    }

    private drawCountdownBar(server: ServerCell): void {
        const phaseMs = server.state === 'outdated' ? server.yellowMs : server.redMs;
        const remaining = Math.max(0, 1 - (this.elapsedMs - server.stateSince) / phaseMs);
        const barX = server.x;
        const barY = server.y + server.h + 8;
        const barH = 10;

        this.ctx.beginPath();
        this.ctx.roundRect(barX, barY, server.w, barH, [5]);
        this.ctx.fillStyle = "rgba(0,0,0,0.45)";
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.beginPath();
        this.ctx.roundRect(barX, barY, server.w * remaining, barH, [5]);
        this.ctx.fillStyle = this.freezeMs > 0 ? POWER_UP_COLORS.freeze : this.stateColor(server.state);
        this.ctx.fill();
        this.ctx.closePath();
    }

    private drawPatchProgress(server: ServerCell): void {
        const cx = server.x + server.w / 2;
        const cy = server.y + server.h / 2;
        const radius = Math.min(server.w, server.h) * 0.38;
        const progress = Math.min(1, server.patchProgressMs / this.PATCH_HOLD_MS);

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = "rgba(0,0,0,0.5)";
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
        this.ctx.lineWidth = 8;
        this.ctx.strokeStyle = "#22c55e";
        this.ctx.stroke();

        const iconSize = radius * 1.2;
        const wrench = imageSprite(this.wrenchImage, iconSize, iconSize);
        if (wrench) this.ctx.drawImage(wrench.canvas, cx - iconSize / 2, cy - iconSize / 2);
    }

    private drawHud(): void {
        const cy = this.hudCanvas.height / 2;
        // the HUD changes ~10 times a second at most (the 0.1 s clock): redraw it only then
        const key = [this.freezeMs > 0 ? "f" + Math.ceil(this.freezeMs / 1000) + (this.freezeMs / this.FREEZE_MS).toFixed(2) : "s" + this.speedLevel,
            (this.elapsedMs / 1000).toFixed(1), this.deadCount, this.patchedCount].join("|");
        if (key === this.hudKey) return;
        this.hudKey = key;
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);

        if (this.freezeMs > 0) {
            gameUi.drawStat(this.hudCtx, 90, cy, 150, t("frozen"), Math.ceil(this.freezeMs / 1000) + " s",
                POWER_UP_COLORS.freeze, this.freezeMs / this.FREEZE_MS);
        } else {
            gameUi.drawStat(this.hudCtx, 90, cy, 150, t("speed"), String(this.speedLevel + 1), gameUi.COLORS.warning);
        }
        gameUi.drawStat(this.hudCtx, this.cvWidth / 2, cy, 200, t("survival"), (this.elapsedMs / 1000).toFixed(1) + " s");
        gameUi.drawSegmentBar(this.hudCtx, this.cvWidth - 270, cy, 170, t("down"), this.deadCount, this.MAX_DEAD,
            gameUi.COLORS.danger);
        gameUi.drawStat(this.hudCtx, this.cvWidth - 90, cy, 150, t("patched"), String(this.patchedCount), "#22c55e");
    }

    private endGame(): void {
        this.ended = true;
        cancelAnimationFrame(this.animationId as number);
        this.hudCanvas.remove();
        this.servers = [];
        this.powerUp = null;
        this.effects.clear();

        // one point per survived second (the original ranking), times the difficulty multiplier
        const seconds = Math.round(this.elapsedMs / 100) / 10;
        const score = Math.round(seconds * this.SCORE_MULTIPLIER);
        gameController.score = score;

        new GameOverScreen({
            ctx: this.ctx,
            cvWidth: this.cvWidth,
            cvHeight: this.cvHeight,
            gameName: GameType.PatchTheServer,
            stats: [
                { label: t("survivalTime"), value: seconds.toFixed(1) + " s" },
                { label: t("serversPatched"), value: String(this.patchedCount) }
            ],
            score: score,
            leaderboardKey: this.LEADERBOARD_KEY
        });
    }
}
