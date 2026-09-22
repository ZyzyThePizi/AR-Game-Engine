import { gameController } from "../../state/gameController";
import { ObjectCoordinates } from "../../interfaces/ObjectCoordinates";
import * as normalizationUtils from "../../utils/normalizationMethods";
import { Effects } from "../../utils/effects";
import * as gameUi from "../../utils/gameUi";
import { GameOverScreen } from "./GameOverScreen";

type ServerState = 'healthy' | 'outdated' | 'critical' | 'dead';

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

    // --- tuning ---
    private readonly GRID_COLS = 5;
    private readonly GRID_ROWS = 3;
    private readonly INITIAL_YELLOW_MS = 5000;
    private readonly INITIAL_RED_MS = 5000;
    private readonly MIN_PHASE_MS = 1500;
    private readonly PATCH_HOLD_MS = 1500;
    private readonly MAX_DEAD = 5;
    // gentle ramp: a typical player lasts ~2 minutes, a skilled two-handed one ~4. There is no time limit;
    // the MIN_* floors keep it beatable only for so long, since outdating eventually outpaces two hands.
    private readonly SPEEDUP_EVERY_MS = 20000;
    private readonly SPEEDUP_FACTOR = 0.91;
    private readonly OUTDATE_INTERVAL_MS = 2500;
    private readonly MIN_OUTDATE_INTERVAL_MS = 700;
    private readonly HAND_RADIUS = 0.05;
    private readonly LEADERBOARD_KEY = "patchTheServerLeaderboard";

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
        this.outdateRandomServer(dt);
        this.updateStates();
        this.updatePatching(dt);
        this.effects.update(dt);
        this.drawServers();
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
                this.effects.floatText(server.x + server.w / 2, server.y, "Kiesett!", gameUi.COLORS.danger);
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
                this.effects.floatText(server.x + server.w / 2, server.y, "Javítva!", "#22c55e");
            }
        });
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
            const image = this.images[server.state];
            if (image.complete && image.naturalWidth) {
                this.ctx.drawImage(image, server.x, server.y, server.w, server.h);
            } else {
                this.ctx.fillStyle = this.stateColor(server.state);
                this.ctx.fillRect(server.x, server.y, server.w, server.h);
            }
            this.ctx.globalAlpha = 1.0;

            if (server.state === 'outdated' || server.state === 'critical') {
                this.drawCountdownBar(server);
            }
            if (server.patchProgressMs > 0) {
                this.drawPatchProgress(server);
            }
        });
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
        this.ctx.fillStyle = this.stateColor(server.state);
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
        if (this.wrenchImage.complete && this.wrenchImage.naturalWidth) {
            this.ctx.drawImage(this.wrenchImage, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
        }
    }

    private drawHud(): void {
        const cy = this.hudCanvas.height / 2;
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);

        gameUi.drawStat(this.hudCtx, 90, cy, 150, "SEBESSÉG", String(this.speedLevel + 1), gameUi.COLORS.warning);
        gameUi.drawStat(this.hudCtx, this.cvWidth / 2, cy, 200, "TÚLÉLÉSI IDŐ", (this.elapsedMs / 1000).toFixed(1) + " s");
        gameUi.drawSegmentBar(this.hudCtx, this.cvWidth - 270, cy, 170, "KIESETT", this.deadCount, this.MAX_DEAD,
            gameUi.COLORS.danger);
        gameUi.drawStat(this.hudCtx, this.cvWidth - 90, cy, 150, "JAVÍTVA", String(this.patchedCount), "#22c55e");
    }

    private endGame(): void {
        this.ended = true;
        cancelAnimationFrame(this.animationId as number);
        this.hudCanvas.remove();
        this.servers = [];
        this.effects.clear();

        const seconds = Math.round(this.elapsedMs / 100) / 10;
        gameController.score = seconds;

        new GameOverScreen({
            ctx: this.ctx,
            cvWidth: this.cvWidth,
            cvHeight: this.cvHeight,
            stats: [
                "Túlélési idő: " + seconds.toFixed(1) + " s",
                "Javított szerverek: " + this.patchedCount
            ],
            score: seconds,
            formatScore: score => score.toFixed(1) + " s",
            leaderboardKey: this.LEADERBOARD_KEY,
            leaderboardTitle: "Ranglista – leghosszabb túlélés"
        });
    }
}
