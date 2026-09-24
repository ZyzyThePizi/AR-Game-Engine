import { gameController } from "../../state/gameController";
import { ObjectCoordinates } from "../../interfaces/ObjectCoordinates";
import * as normalizationUtils from "../../utils/normalizationMethods";
import { Effects } from "../../utils/effects";
import * as gameUi from "../../utils/gameUi";
import { GameOverScreen } from "./GameOverScreen";
import { byDifficulty, scoreMultiplier } from "../../state/settings";
import { GameType } from "../../DataTypes/GameTypes";
import { t } from "../../utils/i18n";
import { PowerUpArt, POWER_UP_COLORS } from "../../utils/powerUps";
import { glowSprite, imageSprite } from "../../utils/sprites";

type ItemKind = 'package' | 'virus';

interface FallingItem {
    kind: ItemKind,
    baseX: number,
    y: number,
    speed: number,      // px per second
    angle: number,
    spin: number,       // radians per second
    swayPhase: number
}

interface FallingClock { baseX: number, y: number, swayPhase: number }

export class FilterTheTraffic {

    // --- tuning (medium = the original balance) ---
    private readonly GAME_MS = 60000;
    private readonly ITEM_RADIUS = 30;
    private readonly PACKAGE_SPEED = byDifficulty({ easy: 95, medium: 120, hard: 150 });    // px per second
    private readonly VIRUS_SPEED = byDifficulty({ easy: 55, medium: 70, hard: 95 });
    private readonly SWAY_PX = 14;
    private readonly HAND_RADIUS = 0.05;
    // both scale with the difficulty multiplier, so the final score is multiplied as a whole
    private readonly PACKAGE_POINTS = Math.round(100 * scoreMultiplier());
    private readonly VIRUS_PENALTY = Math.round(200 * scoreMultiplier());
    private readonly SECOND_PACKAGE_AT_MS = byDifficulty({ easy: 20000, medium: 20000, hard: 15000 });
    private readonly SECOND_VIRUS_AT_MS = byDifficulty({ easy: 40000, medium: 30000, hard: 20000 });
    private readonly BODY_FLASH_MS = 500;
    // bonus stopwatch: falls every 12-18 s, catching it adds time to the clock
    private readonly CLOCK_BONUS_MS = byDifficulty({ easy: 7000, medium: 5000, hard: 4000 });
    private readonly CLOCK_EVERY_MS = { min: 12000, max: 18000 };
    private readonly CLOCK_SPEED = 90;           // px per second, a bit slower than packages
    private readonly CLOCK_RADIUS = 34;
    private readonly TIME_FLASH_MS = 900;
    private readonly LEADERBOARD_KEY = "filterTheTrafficLeaderboard";

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private hudCanvas: HTMLCanvasElement;
    private hudCtx: any;
    private effects = new Effects();
    private images: Record<ItemKind, HTMLImageElement>;

    private items: FallingItem[] = [];
    private caught = 0;
    private bodyHits = 0;
    private bodyFlashMs = 0;
    private powerUpArt = new PowerUpArt(['time']);
    private clock: FallingClock | null = null;
    private nextClockAtMs = this.randomBetween(this.CLOCK_EVERY_MS.min, this.CLOCK_EVERY_MS.max);
    private bonusMs = 0;
    private timeFlashMs = 0;
    private hudKey = "";

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

        this.images = {
            package: this.loadImage('assets/friendlyPackage.svg'),
            virus: this.loadImage('assets/nonFriendlyVirus.svg')
        };

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
        this.items = [this.createItem('package'), this.createItem('virus')];
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
            this.drawBodyZone();
            this.drawHud();
            gameUi.drawCountdown(this.ctx, this.cvWidth, this.cvHeight, Math.max(0, this.countdownMs));
            this.animationId = requestAnimationFrame(() => this.gameLoop());
            return;
        }

        this.elapsedMs += dt;
        this.bodyFlashMs = Math.max(0, this.bodyFlashMs - dt);
        this.timeFlashMs = Math.max(0, this.timeFlashMs - dt);
        this.addItemsOverTime();
        this.updateItems(dt);
        this.updateClock(dt);
        this.effects.update(dt);
        this.draw();

        if (this.elapsedMs >= this.totalMs) {
            this.endGame();
            return;
        }
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }

    // --- logic ---

    private addItemsOverTime(): void {
        const count = (kind: ItemKind) => this.items.filter(item => item.kind === kind).length;
        if (this.elapsedMs >= this.SECOND_PACKAGE_AT_MS && count('package') < 2) this.items.push(this.createItem('package'));
        if (this.elapsedMs >= this.SECOND_VIRUS_AT_MS && count('virus') < 2) this.items.push(this.createItem('virus'));
    }

    private createItem(kind: ItemKind): FallingItem {
        return {
            kind: kind,
            baseX: this.getRandomInt(this.ITEM_RADIUS + this.SWAY_PX, this.cvWidth - this.ITEM_RADIUS - this.SWAY_PX),
            y: -this.ITEM_RADIUS - Math.random() * 150,
            speed: kind === 'package' ? this.PACKAGE_SPEED : this.VIRUS_SPEED,
            angle: 0,
            spin: (Math.random() - 0.5) * 2,
            swayPhase: Math.random() * 2 * Math.PI
        };
    }

    private respawn(item: FallingItem): void {
        Object.assign(item, this.createItem(item.kind));
    }

    private itemX(item: FallingItem): number {
        return item.baseX + Math.sin(this.elapsedMs / 500 + item.swayPhase) * this.SWAY_PX;
    }

    private updateItems(dt: number): void {
        const seconds = dt / 1000;
        const hands = [gameController.leftPalm, gameController.rightPalm]
            .filter(palm => !!palm)
            .map(palm => normalizationUtils.getNormalizedHandCircle((palm!.x * -1) + 1, palm!.y, this.HAND_RADIUS));
        const body = this.getBodyZone();

        this.items.forEach(item => {
            item.y += item.speed * seconds;
            item.angle += item.spin * seconds;

            const x = this.itemX(item);
            const circle = normalizationUtils.getNormalizedCircle(x, item.y, this.ITEM_RADIUS, this.cvWidth, this.cvHeight);

            if (item.kind === 'package' && hands.some(hand => this.isCircleOverlap(circle, hand))) {
                this.caught++;
                gameController.score += this.PACKAGE_POINTS;
                this.effects.burst(x, item.y, "#22c55e");
                this.effects.floatText(x, item.y - 35, "+" + this.PACKAGE_POINTS, "#22c55e");
                this.respawn(item);
            } else if (item.kind === 'virus' && body && this.isCircleOverlapWithRectangle(circle, body)) {
                this.bodyHits++;
                gameController.score -= this.VIRUS_PENALTY;
                this.bodyFlashMs = this.BODY_FLASH_MS;
                this.effects.burst(x, item.y, gameUi.COLORS.danger, 22);
                this.effects.floatText(x, item.y - 35, "-" + this.VIRUS_PENALTY, gameUi.COLORS.danger);
                this.respawn(item);
            } else if (item.y - this.ITEM_RADIUS >= this.cvHeight) {
                this.respawn(item);
            }
        });
    }

    private get totalMs(): number {
        return this.GAME_MS + this.bonusMs;
    }

    private updateClock(dt: number): void {
        if (!this.clock) {
            // no stopwatch in the last seconds: it couldn't land in time anyway
            if (this.elapsedMs >= this.nextClockAtMs && this.totalMs - this.elapsedMs > 5000) {
                this.clock = {
                    baseX: this.randomBetween(80, this.cvWidth - 80),
                    y: -this.CLOCK_RADIUS,
                    swayPhase: Math.random() * 2 * Math.PI
                };
            }
            return;
        }

        const clock = this.clock;
        clock.y += this.CLOCK_SPEED * dt / 1000;
        const x = this.clockX(clock);
        const circle = normalizationUtils.getNormalizedCircle(x, clock.y, this.CLOCK_RADIUS, this.cvWidth, this.cvHeight);
        const caught = [gameController.leftPalm, gameController.rightPalm].some(palm => palm &&
            this.isCircleOverlap(circle, normalizationUtils.getNormalizedHandCircle((palm.x * -1) + 1, palm.y, this.HAND_RADIUS)));

        if (caught) {
            this.bonusMs += this.CLOCK_BONUS_MS;
            this.timeFlashMs = this.TIME_FLASH_MS;
            this.effects.burst(x, clock.y, POWER_UP_COLORS.time, 24);
            this.effects.floatText(x, clock.y - 40, t("timeBonus", { n: this.CLOCK_BONUS_MS / 1000 }), POWER_UP_COLORS.time);
        }
        if (caught || clock.y - this.CLOCK_RADIUS > this.cvHeight) {
            this.clock = null;
            this.nextClockAtMs = this.elapsedMs + this.randomBetween(this.CLOCK_EVERY_MS.min, this.CLOCK_EVERY_MS.max);
        }
    }

    private clockX(clock: FallingClock): number {
        return clock.baseX + Math.sin(this.elapsedMs / 450 + clock.swayPhase) * 30;
    }

    private randomBetween(min: number, max: number): number {
        return min + Math.random() * (max - min);
    }

    private getBodyZone(): ObjectCoordinates | null {
        if (!gameController.leftShoulder || !gameController.rightShoulder) return null;
        return normalizationUtils.getNormalizedShoulders();
    }

    private isCircleOverlap(circle1: ObjectCoordinates, circle2: ObjectCoordinates): boolean {
        const dx = circle1.center.x - circle2.center.x;
        const dy = circle1.center.y - circle2.center.y;
        const radiusSum = (circle1.max.x - circle1.center.x) + (circle2.max.x - circle2.center.x);
        return Math.sqrt(dx * dx + dy * dy) < radiusSum;
    }

    private isCircleOverlapWithRectangle(circle: ObjectCoordinates, rect: ObjectCoordinates): boolean {
        const radius = circle.max.x - circle.center.x;
        const closestX = Math.max(rect.min.x, Math.min(circle.center.x, rect.max.x));
        const closestY = Math.max(rect.min.y, Math.min(circle.center.y, rect.max.y));
        const dx = circle.center.x - closestX;
        const dy = circle.center.y - closestY;
        return (dx * dx + dy * dy) < (radius * radius);
    }

    private getRandomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min)) + Math.ceil(min));
    }

    // --- drawing ---

    private draw(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.drawBodyZone();
        this.items.forEach(item => this.drawItem(item));
        if (this.clock) {
            this.powerUpArt.draw(this.ctx, 'time', this.clockX(this.clock), this.clock.y, this.CLOCK_RADIUS, this.elapsedMs);
        }
        this.effects.draw(this.ctx);
        gameUi.drawHandMarkers(this.ctx, this.cvWidth, this.cvHeight, this.elapsedMs);
        this.drawHud();
    }

    // the shoulder area the viruses must not touch
    private drawBodyZone(): void {
        const body = this.getBodyZone();
        if (!body) return;

        const ctx = this.ctx;
        const flash = this.bodyFlashMs / this.BODY_FLASH_MS;
        const x = body.min.x * this.cvWidth;
        const y = body.min.y * this.cvHeight;
        const w = (body.max.x - body.min.x) * this.cvWidth;
        const h = (body.max.y - body.min.y) * this.cvHeight;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [h / 2]);
        ctx.fillStyle = "rgba(214,40,40," + (0.12 + 0.4 * flash) + ")";
        ctx.fill();
        ctx.setLineDash(flash > 0 ? [] : [10, 8]);
        ctx.lineWidth = 3 + 3 * flash;
        ctx.strokeStyle = "rgba(255,255,255," + (0.55 + 0.45 * flash) + ")";
        ctx.stroke();
        ctx.restore();
    }

    private drawItem(item: FallingItem): void {
        const image = this.images[item.kind];
        const r = this.ITEM_RADIUS;
        const sprite = imageSprite(image, r * 2, r * 2);
        if (!sprite) return;

        const ctx = this.ctx;
        const x = this.itemX(item);
        // soft glow tells good and bad apart at a glance; baked once, pulsed with alpha
        const glow = glowSprite(image, r * 2, r * 2, item.kind === 'package' ? "#22c55e" : gameUi.COLORS.danger, 24);

        ctx.save();
        ctx.translate(x, item.y);
        ctx.rotate(item.kind === 'virus' ? item.angle : Math.sin(item.angle) * 0.3);
        if (glow) {
            ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.elapsedMs / 200 + item.swayPhase);
            ctx.drawImage(glow.canvas, -r - glow.pad, -r - glow.pad);
            ctx.globalAlpha = 1;
        }
        ctx.drawImage(sprite.canvas, -r, -r);
        ctx.restore();
    }

    private drawHud(): void {
        const cy = this.hudCanvas.height / 2;
        const remaining = Math.max(0, this.totalMs - this.elapsedMs);
        const timeColor = this.timeFlashMs > 0 ? POWER_UP_COLORS.time : remaining <= 10000 ? gameUi.COLORS.danger : "#FFFFFF";
        const progress = Math.min(1, remaining / this.GAME_MS);
        // the HUD only changes a few times a second: redraw it only then
        const key = [gameController.score, Math.ceil(remaining / 1000), timeColor, progress.toFixed(2), this.caught].join("|");
        if (key === this.hudKey) return;
        this.hudKey = key;
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);

        gameUi.drawStat(this.hudCtx, 110, cy, 190, t("score"), String(gameController.score), gameUi.COLORS.warning);
        gameUi.drawStat(this.hudCtx, this.cvWidth / 2, cy, 180, t("time"), Math.ceil(remaining / 1000) + " s",
            timeColor, progress);
        gameUi.drawStat(this.hudCtx, this.cvWidth - 110, cy, 190, t("caught"), String(this.caught), "#22c55e");
    }

    private endGame(): void {
        this.ended = true;
        cancelAnimationFrame(this.animationId as number);
        this.hudCanvas.remove();
        this.items = [];
        this.clock = null;
        this.effects.clear();

        const score = gameController.score;
        new GameOverScreen({
            ctx: this.ctx,
            cvWidth: this.cvWidth,
            cvHeight: this.cvHeight,
            gameName: GameType.FilterTheTraffic,
            stats: [
                { label: t("packagesCaught"), value: String(this.caught) },
                { label: t("virusHits"), value: String(this.bodyHits) }
            ],
            score: score,
            leaderboardKey: this.LEADERBOARD_KEY
        });
    }
}
