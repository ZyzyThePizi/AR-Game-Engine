import { gameController } from "../../state/gameController";
import { Effects } from "../../utils/effects";
import * as gameUi from "../../utils/gameUi";
import { GameOverScreen } from "./GameOverScreen";
import { byDifficulty, scoreMultiplier } from "../../state/settings";
import { GameType } from "../../DataTypes/GameTypes";
import { t } from "../../utils/i18n";
import { PowerUpArt, POWER_UP_COLORS } from "../../utils/powerUps";
import { drawSprite, glowSprite, imageSprite } from "../../utils/sprites";

interface Virus {
    x: number,
    y: number,
    vx: number,     // px per second
    vy: number,
    angle: number,
    spin: number    // radians per second
}

interface FlyingClock { x: number, baseY: number, vx: number, phase: number }

interface RepairKit { x: number, y: number, bornMs: number }

export class SaveTheServer {

    // --- tuning (medium = the original balance) ---
    private readonly GAME_MS = 45000;
    private readonly MAX_HEALTH = 10;
    private readonly VIRUS_COUNT = byDifficulty({ easy: 4, medium: 5, hard: 6 });
    private readonly VIRUS_SPEED = byDifficulty({ easy: 52, medium: 70, hard: 92 });     // px per second
    private readonly SCORE_MULTIPLIER = scoreMultiplier();
    private readonly VIRUS_RADIUS = 25;
    private readonly HAND_RADIUS = 0.05;
    private readonly SERVER_WIDTH = 250;
    private readonly SERVER_HEIGHT = 350;
    private readonly HIT_FLASH_MS = 450;
    // bonus stopwatch: flies across the upper half every 12-16 s, catching it adds time
    private readonly CLOCK_BONUS_MS = byDifficulty({ easy: 7000, medium: 5000, hard: 4000 });
    private readonly CLOCK_EVERY_MS = { min: 12000, max: 16000 };
    private readonly CLOCK_SPEED = 130;          // px per second, crosses the screen in ~7 s
    private readonly CLOCK_RADIUS = 34;
    private readonly TIME_FLASH_MS = 900;
    // repair kit: only once the server has taken REPAIR_MIN_DAMAGE hits, the sooner the more
    // damaged it is, and only a few per game. It waits beside the server for REPAIR_LIFETIME_MS,
    // so grabbing it means leaving the defense for a moment.
    private readonly REPAIR_HEALTH = byDifficulty({ easy: 3, medium: 2, hard: 2 });
    private readonly MAX_REPAIR_KITS = byDifficulty({ easy: 3, medium: 2, hard: 1 });
    private readonly REPAIR_MIN_DAMAGE = 2;
    private readonly REPAIR_WAIT_MS = 12000;        // at full health; shrinks to 40 % near zero
    private readonly REPAIR_LIFETIME_MS = 5000;
    private readonly REPAIR_RADIUS = 36;
    private readonly HEAL_FLASH_MS = 900;
    private readonly SERVER_GLOW_BLUR = 40;
    private readonly LEADERBOARD_KEY = "saveTheServerLeaderboard";

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private hudCanvas: HTMLCanvasElement;
    private hudCtx: any;
    private effects = new Effects();
    private serverImage: HTMLImageElement;
    private virusImage: HTMLImageElement;

    private serverLeft: number;
    private serverRight: number;
    private serverTop: number;
    private serverBottom: number;

    private viruses: Virus[] = [];
    private health = this.MAX_HEALTH;
    private blocked = 0;
    private hitFlashMs = 0;
    private powerUpArt = new PowerUpArt(['time', 'repair']);
    private kit: RepairKit | null = null;
    private kitsUsed = 0;
    private kitWaitMs = 0;
    private healFlashMs = 0;
    private hudKey = "";
    private clock: FlyingClock | null = null;
    private nextClockAtMs = this.randomBetween(this.CLOCK_EVERY_MS.min, this.CLOCK_EVERY_MS.max);
    private bonusMs = 0;
    private timeFlashMs = 0;

    private animationId = null as number | null;
    private lastFrameTime = 0;
    private countdownMs = gameUi.COUNTDOWN_MS;
    private elapsedMs = 0;
    private ended = false;

    constructor(cvWidth: number, cvHeight: number, ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;

        this.hudCanvas = gameUi.createHudCanvas(this.cvWidth, this.cvHeight);
        this.hudCtx = this.hudCanvas.getContext("2d")!;

        this.serverImage = new Image();
        this.serverImage.src = 'assets/server.svg';
        this.virusImage = new Image();
        this.virusImage.src = 'assets/nonFriendlyVirus.svg';

        this.serverLeft = this.cvWidth / 2 - this.SERVER_WIDTH / 2;
        this.serverRight = this.cvWidth / 2 + this.SERVER_WIDTH / 2;
        this.serverTop = this.cvHeight - this.SERVER_HEIGHT;
        this.serverBottom = this.cvHeight;

        this.initGame();
    }

    private initGame(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        gameController.score = 0;
        gameController.castleHealth = this.health;
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    private gameLoop(): void {
        if (this.ended) return;

        const now = performance.now();
        if (now - this.lastFrameTime < gameUi.MIN_FRAME_MS) {
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }
        const dt = Math.min(now - this.lastFrameTime, 100);
        this.lastFrameTime = now;

        if (this.countdownMs > 0) {
            this.countdownMs -= dt;
            this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
            this.drawServer();
            this.drawHud();
            gameUi.drawCountdown(this.ctx, this.cvWidth, this.cvHeight, Math.max(0, this.countdownMs));
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        this.elapsedMs += dt;
        this.hitFlashMs = Math.max(0, this.hitFlashMs - dt);
        this.timeFlashMs = Math.max(0, this.timeFlashMs - dt);
        this.healFlashMs = Math.max(0, this.healFlashMs - dt);
        this.updateViruses(dt);
        this.updateClock(dt);
        this.updateRepairKit(dt);
        this.effects.update(dt);
        this.draw();

        if (this.health <= 0 || this.elapsedMs >= this.totalMs) {
            this.endGame();
            return;
        }
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    // --- logic ---

    private updateViruses(dt: number): void {
        const seconds = dt / 1000;
        const hands = [gameController.leftPalm, gameController.rightPalm]
            .filter(palm => !!palm)
            .map(palm => ({ x: (palm!.x * -1) + 1, y: palm!.y }));

        this.viruses = this.viruses.filter(virus => {
            virus.x += virus.vx * seconds;
            virus.y += virus.vy * seconds;
            virus.angle += virus.spin * seconds;

            if (hands.some(hand => this.isHandOnVirus(hand, virus))) {
                this.blocked++;
                gameController.score = this.blocked;
                this.effects.burst(virus.x, virus.y, "#22c55e");
                this.effects.floatText(virus.x, virus.y - 30, "+1", "#22c55e");
                return false;
            }

            if (this.isVirusOnServer(virus)) {
                this.health = Math.max(0, this.health - 1);
                gameController.castleHealth = this.health;
                this.hitFlashMs = this.HIT_FLASH_MS;
                this.effects.burst(virus.x, virus.y, gameUi.COLORS.danger, 22);
                this.effects.floatText(virus.x, virus.y - 30, t("lifeLost", { n: 1 }), gameUi.COLORS.danger);
                return false;
            }
            return true;
        });

        while (this.viruses.length < this.VIRUS_COUNT) {
            this.viruses.push(this.createVirus());
        }
    }

    private isHandOnVirus(hand: { x: number, y: number }, virus: Virus): boolean {
        const dx = virus.x / this.cvWidth - hand.x;
        const dy = virus.y / this.cvHeight - hand.y;
        const radiusSum = this.VIRUS_RADIUS / this.cvWidth + this.HAND_RADIUS;
        return Math.sqrt(dx * dx + dy * dy) < radiusSum;
    }

    private isVirusOnServer(virus: Virus): boolean {
        const closestX = Math.max(this.serverLeft, Math.min(virus.x, this.serverRight));
        const closestY = Math.max(this.serverTop, Math.min(virus.y, this.serverBottom));
        const dx = virus.x - closestX;
        const dy = virus.y - closestY;
        return Math.sqrt(dx * dx + dy * dy) < this.VIRUS_RADIUS;
    }

    private get totalMs(): number {
        return this.GAME_MS + this.bonusMs;
    }

    // the stopwatch crosses above the server with a gentle wave, from a random side
    private updateClock(dt: number): void {
        if (!this.clock) {
            // one pickup on screen at a time
            if (!this.kit && this.elapsedMs >= this.nextClockAtMs && this.totalMs - this.elapsedMs > 5000) {
                const fromLeft = Math.random() < 0.5;
                this.clock = {
                    x: fromLeft ? -this.CLOCK_RADIUS : this.cvWidth + this.CLOCK_RADIUS,
                    baseY: this.randomBetween(170, this.serverTop - 60),
                    vx: fromLeft ? this.CLOCK_SPEED : -this.CLOCK_SPEED,
                    phase: Math.random() * 2 * Math.PI
                };
            }
            return;
        }

        const clock = this.clock;
        clock.x += clock.vx * dt / 1000;
        const y = this.clockY(clock);
        const caught = [gameController.leftPalm, gameController.rightPalm].some(palm => {
            if (!palm) return false;
            const dx = clock.x / this.cvWidth - ((palm.x * -1) + 1);
            const dy = y / this.cvHeight - palm.y;
            return Math.sqrt(dx * dx + dy * dy) < this.CLOCK_RADIUS / this.cvWidth + this.HAND_RADIUS;
        });

        if (caught) {
            this.bonusMs += this.CLOCK_BONUS_MS;
            this.timeFlashMs = this.TIME_FLASH_MS;
            this.effects.burst(clock.x, y, POWER_UP_COLORS.time, 24);
            this.effects.floatText(clock.x, y - 40, t("timeBonus", { n: this.CLOCK_BONUS_MS / 1000 }), POWER_UP_COLORS.time);
        }
        if (caught || clock.x < -this.CLOCK_RADIUS * 2 || clock.x > this.cvWidth + this.CLOCK_RADIUS * 2) {
            this.clock = null;
            this.nextClockAtMs = this.elapsedMs + this.randomBetween(this.CLOCK_EVERY_MS.min, this.CLOCK_EVERY_MS.max);
        }
    }

    private updateRepairKit(dt: number): void {
        if (this.kit) {
            const kit = this.kit;
            if (this.isHandOn(kit.x, kit.y, this.REPAIR_RADIUS)) {
                this.kit = null;
                this.kitsUsed++;
                const healed = Math.min(this.REPAIR_HEALTH, this.MAX_HEALTH - this.health);
                this.health += healed;
                gameController.castleHealth = this.health;
                this.healFlashMs = this.HEAL_FLASH_MS;
                this.effects.burst(kit.x, kit.y, POWER_UP_COLORS.repair, 24);
                this.effects.burst(this.cvWidth / 2, this.serverTop + 60, POWER_UP_COLORS.repair, 18);
                this.effects.floatText(kit.x, kit.y - 45, t("lifeGained", { n: healed }), POWER_UP_COLORS.repair);
            } else if (this.elapsedMs - kit.bornMs >= this.REPAIR_LIFETIME_MS) {
                this.kit = null;
            }
            return;
        }

        const damaged = this.MAX_HEALTH - this.health >= this.REPAIR_MIN_DAMAGE;
        const timeLeft = this.totalMs - this.elapsedMs;
        if (!damaged || this.kitsUsed >= this.MAX_REPAIR_KITS || this.clock || timeLeft < 6000) return;

        this.kitWaitMs += dt;
        if (this.kitWaitMs < this.REPAIR_WAIT_MS * (0.4 + 0.6 * this.health / this.MAX_HEALTH)) return;
        this.kitWaitMs = 0;

        // beside the server, left or right, at arm's height
        const left = Math.random() < 0.5;
        this.kit = {
            x: left ? this.randomBetween(90, this.serverLeft - 70) : this.randomBetween(this.serverRight + 70, this.cvWidth - 90),
            y: this.randomBetween(this.serverTop - 60, this.cvHeight - 170),
            bornMs: this.elapsedMs
        };
    }

    private isHandOn(x: number, y: number, radius: number): boolean {
        return [gameController.leftPalm, gameController.rightPalm].some(palm => {
            if (!palm) return false;
            const dx = x / this.cvWidth - ((palm.x * -1) + 1);
            const dy = (y / this.cvHeight - palm.y) * this.cvHeight / this.cvWidth;
            return Math.sqrt(dx * dx + dy * dy) < radius / this.cvWidth + this.HAND_RADIUS;
        });
    }

    private clockY(clock: FlyingClock): number {
        return clock.baseY + Math.sin(this.elapsedMs / 400 + clock.phase) * 28;
    }

    private randomBetween(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    // spawns on a random screen edge (not below the server) and flies towards the server
    private createVirus(): Virus {
        let x: number;
        let y: number;
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) {
            x = 0;
            y = Math.random() * this.cvHeight;
        } else if (edge === 1) {
            x = this.cvWidth;
            y = Math.random() * this.cvHeight;
        } else if (edge === 2) {
            x = Math.random() * this.cvWidth;
            y = 0;
        } else {
            do {
                x = Math.random() * this.cvWidth;
            } while (x > this.serverLeft - this.VIRUS_RADIUS && x < this.serverRight + this.VIRUS_RADIUS);
            y = this.cvHeight;
        }

        const deltaX = this.cvWidth / 2 - x;
        const deltaY = this.cvHeight - this.SERVER_HEIGHT / 2 - y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        return {
            x: x,
            y: y,
            vx: deltaX / distance * this.VIRUS_SPEED,
            vy: deltaY / distance * this.VIRUS_SPEED,
            angle: Math.random() * 2 * Math.PI,
            spin: (Math.random() - 0.5) * 3
        };
    }

    // --- drawing ---

    private draw(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.drawHitVignette();
        this.drawServer();
        this.viruses.forEach(virus => this.drawVirus(virus));
        if (this.clock) {
            this.powerUpArt.draw(this.ctx, 'time', this.clock.x, this.clockY(this.clock), this.CLOCK_RADIUS, this.elapsedMs);
        }
        if (this.kit) {
            const lifeLeft = 1 - (this.elapsedMs - this.kit.bornMs) / this.REPAIR_LIFETIME_MS;
            this.powerUpArt.draw(this.ctx, 'repair', this.kit.x, this.kit.y, this.REPAIR_RADIUS, this.elapsedMs, lifeLeft);
        }
        this.effects.draw(this.ctx);
        gameUi.drawHandMarkers(this.ctx, this.cvWidth, this.cvHeight, this.elapsedMs);
        this.drawHud();
    }

    private healthColor(): string {
        const ratio = this.health / this.MAX_HEALTH;
        if (ratio > 0.6) return "#22c55e";
        if (ratio > 0.3) return gameUi.COLORS.warning;
        return gameUi.COLORS.danger;
    }

    private drawServer(): void {
        const ctx = this.ctx;
        const flash = this.hitFlashMs / this.HIT_FLASH_MS;
        const heal = this.healFlashMs / this.HEAL_FLASH_MS;
        const shake = flash > 0 ? Math.sin(this.elapsedMs / 20) * 8 * flash : 0;
        const x = this.serverLeft + shake;
        const w = this.SERVER_WIDTH;
        const h = this.SERVER_HEIGHT;

        const server = imageSprite(this.serverImage, w, h);
        if (!server) {
            ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
            ctx.fillRect(x, this.serverTop, w, h);
            return;
        }

        // glow in the health color (red while hit, green while repaired): baked once per
        // color, pulsed with alpha instead of an expensive per-frame shadowBlur
        const glowColor = flash > 0 ? gameUi.COLORS.danger : heal > 0 ? POWER_UP_COLORS.repair : this.healthColor();
        const glow = glowSprite(this.serverImage, w, h, glowColor, this.SERVER_GLOW_BLUR);
        ctx.save();
        if (glow) {
            ctx.globalAlpha = Math.min(1, 0.55 + 0.25 * Math.sin(this.elapsedMs / 300) + 0.45 * Math.max(flash, heal));
            drawSprite(ctx, glow, x, this.serverTop, w, h);
        }
        ctx.globalAlpha = 0.8;
        drawSprite(ctx, server, x, this.serverTop, w, h);
        ctx.restore();
    }

    private drawHitVignette(): void {
        if (this.hitFlashMs <= 0) return;
        const ctx = this.ctx;
        const alpha = 0.5 * this.hitFlashMs / this.HIT_FLASH_MS;
        const gradient = ctx.createRadialGradient(this.cvWidth / 2, this.cvHeight / 2, this.cvHeight * 0.35,
            this.cvWidth / 2, this.cvHeight / 2, this.cvWidth * 0.7);
        gradient.addColorStop(0, "rgba(214,40,40,0)");
        gradient.addColorStop(1, "rgba(214,40,40," + alpha + ")");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.cvWidth, this.cvHeight);
    }

    private drawVirus(virus: Virus): void {
        const ctx = this.ctx;
        const r = this.VIRUS_RADIUS;
        const sprite = imageSprite(this.virusImage, r * 2, r * 2);
        if (!sprite) return;

        ctx.save();
        // fading trail behind the virus
        for (let k = 2; k >= 1; k--) {
            ctx.globalAlpha = 0.15 * (3 - k);
            const tx = virus.x - virus.vx * 0.09 * k;
            const ty = virus.y - virus.vy * 0.09 * k;
            ctx.drawImage(sprite.canvas, tx - r * 0.8, ty - r * 0.8, r * 1.6, r * 1.6);
        }
        ctx.globalAlpha = 1;
        ctx.translate(virus.x, virus.y);
        ctx.rotate(virus.angle);
        const pulse = 1 + 0.08 * Math.sin(this.elapsedMs / 120 + virus.angle);
        ctx.drawImage(sprite.canvas, -r * pulse, -r * pulse, r * 2 * pulse, r * 2 * pulse);
        ctx.restore();
    }

    private drawHud(): void {
        const cy = this.hudCanvas.height / 2;
        const remaining = Math.max(0, this.totalMs - this.elapsedMs);
        const timeColor = this.timeFlashMs > 0 ? POWER_UP_COLORS.time : remaining <= 10000 ? gameUi.COLORS.danger : "#FFFFFF";
        const healthColor = this.healFlashMs > 0 ? "#4ade80" : this.healthColor();
        const progress = Math.min(1, remaining / this.GAME_MS);
        // the HUD only changes a few times a second: redraw it only then
        const key = [this.health, healthColor, Math.ceil(remaining / 1000), timeColor, progress.toFixed(2), this.blocked].join("|");
        if (key === this.hudKey) return;
        this.hudKey = key;
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);

        gameUi.drawSegmentBar(this.hudCtx, 130, cy, 230, t("health"), this.health, this.MAX_HEALTH, healthColor);
        gameUi.drawStat(this.hudCtx, this.cvWidth / 2, cy, 180, t("time"), Math.ceil(remaining / 1000) + " s",
            timeColor, progress);
        gameUi.drawStat(this.hudCtx, this.cvWidth - 110, cy, 190, t("blocked"), String(this.blocked), "#22c55e");
    }

    private endGame(): void {
        this.ended = true;
        cancelAnimationFrame(this.animationId as number);
        this.hudCanvas.remove();
        this.viruses = [];
        this.clock = null;
        this.kit = null;
        this.effects.clear();

        const finalScore = Math.round((this.health + 1) * (this.blocked * 10) * this.SCORE_MULTIPLIER);
        new GameOverScreen({
            ctx: this.ctx,
            cvWidth: this.cvWidth,
            cvHeight: this.cvHeight,
            gameName: GameType.SaveTheServer,
            stats: [
                { label: t("attacksBlocked"), value: String(this.blocked) },
                { label: t("healthLeft"), value: this.health + " / " + this.MAX_HEALTH }
            ],
            score: finalScore,
            leaderboardKey: this.LEADERBOARD_KEY
        });
    }
}
