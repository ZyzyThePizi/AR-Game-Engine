import { gameController } from "../../environments/environment";
import { ObjectCoordinates } from "../../interfaces/ObjectCoordinates";
import * as normalizationUtils from "../../utils/normalizationMethods";
import { addLeaderboardEntry, LeaderboardEntry } from "../../utils/leaderboard";

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
    private readonly NAME_ENTRY_TIMEOUT_MS = 60000;
    private readonly LEADERBOARD_SHOW_MS = 7000;

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private hudCanvas: HTMLCanvasElement;
    private hudCtx: any;
    private nameOverlay: HTMLDivElement | null = null;
    private nameEntryTimeout = null as NodeJS.Timeout | null;

    private servers: ServerCell[] = [];
    private images: Record<ServerState, HTMLImageElement>;
    private wrenchImage: HTMLImageElement;

    private animationId = null as number | null;
    private lastFrameTime = 0;
    private elapsedMs = 0;
    private sinceLastOutdateMs = 0;
    private patchedCount = 0;
    private deadCount = 0;
    private ended = false;

    constructor(cvWidth: number, cvHeight: number, ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;

        this.hudCanvas = document.createElement("canvas");
        this.hudCanvas.width = this.cvWidth;
        this.hudCanvas.height = this.cvHeight * 0.15;
        this.hudCanvas.style.position = "absolute";
        this.hudCanvas.style.top = "0";
        this.hudCanvas.style.left = "0";
        document.getElementById('container')?.appendChild(this.hudCanvas);
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
        this.elapsedMs += dt;

        this.outdateRandomServer(dt);
        this.updateStates();
        this.updatePatching(dt);
        this.drawServers();
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
        const h = this.hudCanvas.height;
        this.hudCtx.clearRect(0, 0, this.hudCanvas.width, h);

        this.drawHudBox(this.cvWidth / 2 - 90, 180, "Idő: " + (this.elapsedMs / 1000).toFixed(1) + " s", "bold 20pt Arial");
        this.drawHudBox(10, 140, "Sebesség: " + (this.speedLevel + 1), "bold 14pt Arial");
        this.drawHudBox(this.cvWidth - 150, 140, "Kiesett: " + this.deadCount + "/" + this.MAX_DEAD, "bold 14pt Arial",
            h / 2 - 20);
        this.drawHudBox(this.cvWidth - 150, 140, "Javítva: " + this.patchedCount, "bold 14pt Arial", h / 2 + 20);
    }

    private drawHudBox(x: number, width: number, text: string, font: string, centerY: number = this.hudCanvas.height / 2): void {
        const boxHeight = font.includes("20pt") ? 70 : 34;
        this.hudCtx.beginPath();
        this.hudCtx.roundRect(x, centerY - boxHeight / 2, width, boxHeight, [10]);
        this.hudCtx.fillStyle = "rgba(0,0,0,0.35)";
        this.hudCtx.fill();
        this.hudCtx.closePath();

        this.hudCtx.fillStyle = "#FFFFFF";
        this.hudCtx.font = font;
        this.hudCtx.textAlign = "center";
        this.hudCtx.textBaseline = "middle";
        this.hudCtx.fillText(text, x + width / 2, centerY);
    }

    private endGame(): void {
        this.ended = true;
        cancelAnimationFrame(this.animationId as number);
        this.hudCanvas.remove();

        const seconds = Math.round(this.elapsedMs / 100) / 10;
        gameController.score = seconds;

        this.showGameResults(seconds);
        this.showNameEntry(seconds);
    }

    private showGameResults(seconds: number): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.drawPanel(this.cvWidth / 2 - 260, this.cvHeight / 2 - 170, 520, 340);

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.font = "bold 30pt Arial";
        this.ctx.fillText("A játéknak vége!", this.cvWidth / 2, this.cvHeight / 2 - 120);
        this.ctx.font = "bold 22pt Arial";
        this.ctx.fillText("Túlélési idő: " + seconds.toFixed(1) + " s", this.cvWidth / 2, this.cvHeight / 2 - 60);
        this.ctx.fillText("Javított szerverek: " + this.patchedCount, this.cvWidth / 2, this.cvHeight / 2 - 15);
    }

    private showNameEntry(seconds: number): void {
        const overlay = document.createElement("div");
        // position in canvas pixels: the container can be wider than the canvas
        overlay.style.cssText = "position:absolute; left:" + (this.cvWidth / 2) + "px; top:" + (this.cvHeight / 2 + 70) + "px;" +
            "transform:translate(-50%,-50%); display:flex; gap:8px; z-index:10;";

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 20;
        input.placeholder = "Játékos neve";
        input.style.cssText = "font-size:18pt; padding:6px 10px; border-radius:8px; border:2px solid #fff; width:260px;";

        const button = document.createElement("button");
        button.innerText = "Mentés";
        button.style.cssText = "font-size:18pt; padding:6px 16px; border-radius:8px; border:none;" +
            "background:#8db600; color:#fff; font-weight:bold; cursor:pointer;";

        const submit = () => this.submitName(input.value, seconds);
        button.addEventListener("click", submit);
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") submit();
        });

        overlay.appendChild(input);
        overlay.appendChild(button);
        document.getElementById('container')?.appendChild(overlay);
        this.nameOverlay = overlay;
        input.focus();

        // never leave the station stuck if nobody types a name
        this.nameEntryTimeout = setTimeout(() => this.submitName("", seconds), this.NAME_ENTRY_TIMEOUT_MS);
    }

    private submitName(rawName: string, seconds: number): void {
        if (!this.nameOverlay) return;
        clearTimeout(this.nameEntryTimeout as NodeJS.Timeout);
        this.nameOverlay.remove();
        this.nameOverlay = null;

        const entry: LeaderboardEntry = { name: rawName.trim() || "Névtelen", seconds: seconds, date: Date.now() };
        const entries = addLeaderboardEntry(this.LEADERBOARD_KEY, entry);
        this.showLeaderboard(entries, entry);

        setTimeout(() => this.returnToMenu(), this.LEADERBOARD_SHOW_MS);
    }

    private showLeaderboard(entries: LeaderboardEntry[], current: LeaderboardEntry): void {
        const rowHeight = 36;
        const panelW = 580;
        const panelH = 150 + entries.length * rowHeight;
        const panelX = this.cvWidth / 2 - panelW / 2;
        const panelY = this.cvHeight / 2 - panelH / 2;

        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.drawPanel(panelX, panelY, panelW, panelH);

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.textBaseline = "middle";
        this.ctx.textAlign = "center";
        this.ctx.font = "bold 26pt Arial";
        this.ctx.fillText("Ranglista – leghosszabb túlélés", this.cvWidth / 2, panelY + 40);

        const firstRowY = panelY + 95;
        entries.forEach((entry, index) => {
            const y = firstRowY + index * rowHeight;
            const isCurrent = entry.date === current.date && entry.name === current.name;
            if (isCurrent) {
                this.ctx.beginPath();
                this.ctx.roundRect(panelX + 20, y - rowHeight / 2 + 2, panelW - 40, rowHeight - 4, [8]);
                this.ctx.fillStyle = "rgba(141,182,0,0.9)";
                this.ctx.fill();
                this.ctx.closePath();
            }
            this.ctx.fillStyle = "#FFFFFF";
            this.ctx.font = (isCurrent ? "bold " : "") + "18pt Arial";
            this.ctx.textAlign = "left";
            this.ctx.fillText((index + 1) + ". " + entry.name, panelX + 40, y);
            this.ctx.textAlign = "right";
            this.ctx.fillText(entry.seconds.toFixed(1) + " s", panelX + panelW - 40, y);
        });

        if (!entries.includes(current)) {
            this.ctx.textAlign = "center";
            this.ctx.font = "bold 16pt Arial";
            this.ctx.fillText("A te időd: " + current.seconds.toFixed(1) + " s", this.cvWidth / 2, panelY + panelH - 20);
        }
    }

    private drawPanel(x: number, y: number, w: number, h: number): void {
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, w, h, [15]);
        this.ctx.fillStyle = "rgba(255,99,0,0.8)";
        this.ctx.fill();
        this.ctx.closePath();
    }

    private returnToMenu(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.servers = [];
        if (!gameController.menuController) return;
        gameController.isInGame = false;
        gameController.menuController.drawMenu();
        // garbage collector
        gameController.menuController.game = null;
    }
}
