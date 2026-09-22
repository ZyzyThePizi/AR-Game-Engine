import { gameController } from "../../state/gameController";
import { Effects } from "../../utils/effects";
import * as gameUi from "../../utils/gameUi";
import { GameOverScreen } from "./GameOverScreen";

interface Virus {
    x: number,
    y: number,
    vx: number,     // px per second
    vy: number,
    angle: number,
    spin: number    // radians per second
}

export class SaveTheServer {

    // --- tuning ---
    private readonly GAME_MS = 45000;
    private readonly MAX_HEALTH = 10;
    private readonly VIRUS_COUNT = 5;
    private readonly VIRUS_SPEED = 70;           // px per second
    private readonly VIRUS_RADIUS = 25;
    private readonly HAND_RADIUS = 0.05;
    private readonly SERVER_WIDTH = 250;
    private readonly SERVER_HEIGHT = 350;
    private readonly HIT_FLASH_MS = 450;
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
        this.updateViruses(dt);
        this.effects.update(dt);
        this.draw();

        if (this.health <= 0 || this.elapsedMs >= this.GAME_MS) {
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
                this.effects.floatText(virus.x, virus.y - 30, "-1 élet", gameUi.COLORS.danger);
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
        const shake = flash > 0 ? Math.sin(this.elapsedMs / 20) * 8 * flash : 0;
        const x = this.serverLeft + shake;

        ctx.save();
        // glow in the health color, red while being hit
        ctx.shadowColor = flash > 0 ? gameUi.COLORS.danger : this.healthColor();
        ctx.shadowBlur = 30 + 15 * Math.sin(this.elapsedMs / 300) + 30 * flash;
        ctx.globalAlpha = 0.8;
        if (this.serverImage.complete && this.serverImage.naturalWidth) {
            ctx.drawImage(this.serverImage, x, this.serverTop, this.SERVER_WIDTH, this.SERVER_HEIGHT);
        } else {
            ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
            ctx.fillRect(x, this.serverTop, this.SERVER_WIDTH, this.SERVER_HEIGHT);
        }
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
        if (!this.virusImage.complete || !this.virusImage.naturalWidth) return;

        ctx.save();
        // fading trail behind the virus
        for (let k = 2; k >= 1; k--) {
            ctx.globalAlpha = 0.15 * (3 - k);
            const tx = virus.x - virus.vx * 0.09 * k;
            const ty = virus.y - virus.vy * 0.09 * k;
            ctx.drawImage(this.virusImage, tx - r * 0.8, ty - r * 0.8, r * 1.6, r * 1.6);
        }
        ctx.globalAlpha = 1;
        ctx.translate(virus.x, virus.y);
        ctx.rotate(virus.angle);
        const pulse = 1 + 0.08 * Math.sin(this.elapsedMs / 120 + virus.angle);
        ctx.drawImage(this.virusImage, -r * pulse, -r * pulse, r * 2 * pulse, r * 2 * pulse);
        ctx.restore();
    }

    private drawHud(): void {
        const cy = this.hudCanvas.height / 2;
        const remaining = Math.max(0, this.GAME_MS - this.elapsedMs);
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);

        gameUi.drawSegmentBar(this.hudCtx, 130, cy, 230, "ÉLET", this.health, this.MAX_HEALTH, this.healthColor());
        gameUi.drawStat(this.hudCtx, this.cvWidth / 2, cy, 180, "IDŐ", Math.ceil(remaining / 1000) + " s",
            remaining <= 10000 ? gameUi.COLORS.danger : "#FFFFFF", remaining / this.GAME_MS);
        gameUi.drawStat(this.hudCtx, this.cvWidth - 110, cy, 190, "KIVÉDVE", String(this.blocked), "#22c55e");
    }

    private endGame(): void {
        this.ended = true;
        cancelAnimationFrame(this.animationId as number);
        this.hudCanvas.remove();
        this.viruses = [];
        this.effects.clear();

        const finalScore = (this.health + 1) * (this.blocked * 10);
        new GameOverScreen({
            ctx: this.ctx,
            cvWidth: this.cvWidth,
            cvHeight: this.cvHeight,
            stats: [
                "Megmaradt élet: " + this.health,
                "Kivédett támadások: " + this.blocked,
                "Végső pontszám: " + finalScore
            ],
            score: finalScore,
            formatScore: score => score + " pont",
            leaderboardKey: this.LEADERBOARD_KEY,
            leaderboardTitle: "Ranglista – legtöbb pont"
        });
    }
}
