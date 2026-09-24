import { gameController } from "../state/gameController";
import { DIFFICULTY_COLOR, scoreMultiplier, settings } from "../state/settings";
import { formatMultiplier, t } from "./i18n";

// Shared drawing helpers so every game has the same look.

export const HUD_HEIGHT_RATIO = 0.15;
export const COUNTDOWN_MS = 3000;
// Frame cap for every loop: on 120/144 Hz screens requestAnimationFrame fires 2-2.4x as
// often as on a 60 Hz one; drawing more than ~60-70 frames a second only burns CPU.
export const MIN_FRAME_MS = 12;

export const COLORS = {
    brand: "#ff462d",
    good: "#8db600",
    warning: "#e0a800",
    danger: "#d62828",
    hudBox: "rgba(0,0,0,0.5)"
};

export const GLASS = {
    tint: "rgba(15,23,42,0.55)",
    border: "rgba(255,255,255,0.30)",
    key: "rgba(255,255,255,0.10)",
    veil: "rgba(8,12,24,0.45)"      // dims the camera image behind full-screen overlays
};

// HUD canvas on top of the game canvas; remove it when the game ends
export function createHudCanvas(cvWidth: number, cvHeight: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = cvWidth;
    canvas.height = cvHeight * HUD_HEIGHT_RATIO;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    document.getElementById('container')?.appendChild(canvas);
    return canvas;
}

// A HUD box with a small label and a big value. `progress` (0-1) adds a bar along the bottom.
export function drawStat(ctx: any, cx: number, cy: number, width: number, label: string, value: string,
                         accent: string = "#FFFFFF", progress: number | null = null): void {
    const height = 76;
    const x = cx - width / 2;
    const y = cy - height / 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [14]);
    ctx.fillStyle = COLORS.hudBox;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = accent;
    ctx.font = "bold 11pt Arial";
    ctx.fillText(label, cx, y + 18);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22pt Arial";
    ctx.fillText(value, cx, y + 47);

    if (progress !== null) {
        const barW = width - 24;
        ctx.beginPath();
        ctx.roundRect(x + 12, y + height - 9, barW, 5, [3]);
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(x + 12, y + height - 9, barW * Math.max(0, Math.min(1, progress)), 5, [3]);
        ctx.fillStyle = accent;
        ctx.fill();
    }
    ctx.restore();
}

// A segmented bar, e.g. remaining health
export function drawSegmentBar(ctx: any, cx: number, cy: number, width: number, label: string,
                               filled: number, total: number, color: string): void {
    const height = 76;
    const x = cx - width / 2;
    const y = cy - height / 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, [14]);
    ctx.fillStyle = COLORS.hudBox;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.font = "bold 11pt Arial";
    ctx.fillText(label, cx, y + 18);

    const gap = 4;
    const segW = (width - 24 - gap * (total - 1)) / total;
    for (let i = 0; i < total; i++) {
        ctx.beginPath();
        ctx.roundRect(x + 12 + i * (segW + gap), y + 34, segW, 26, [4]);
        ctx.fillStyle = i < filled ? color : "rgba(255,255,255,0.15)";
        ctx.fill();
    }
    ctx.restore();
}

// Frosted-glass look without backdrop-filter (too costly on low-end PCs over live video):
// a translucent tint, a soft top highlight and a thin light border.
export function drawGlass(ctx: any, x: number, y: number, w: number, h: number, radius: number = 18,
                          tint: string = GLASS.tint, border: string = GLASS.border): void {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [radius]);
    ctx.fillStyle = tint;
    ctx.fill();
    const highlight = ctx.createLinearGradient(0, y, 0, y + h);
    highlight.addColorStop(0, "rgba(255,255,255,0.20)");
    highlight.addColorStop(0.5, "rgba(255,255,255,0.05)");
    highlight.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = highlight;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.restore();
}

// Small colored pill with text, centered on (cx, cy). Returns its width.
export function drawChip(ctx: any, cx: number, cy: number, text: string, color: string,
                         font: string = "bold 11pt Arial", height: number = 24): number {
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(text).width + height;
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - height / 2, w, height, [height / 2]);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, cx, cy + 1);
    ctx.restore();
    return w;
}

// Offscreen canvas for layers that only change occasionally (drawn once, blitted every frame)
export function createLayer(width: number, height: number): { canvas: HTMLCanvasElement, ctx: any } {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return { canvas: canvas, ctx: canvas.getContext("2d")! };
}

export function drawOutlinedText(ctx: any, text: string, x: number, y: number, font: string,
                                 color: string = "#FFFFFF", outline: number = 6): void {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = outline;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
}

// Rings where the palms are, so players can see what the game "feels"
export function drawHandMarkers(ctx: any, cvWidth: number, cvHeight: number, time: number): void {
    [gameController.leftPalm, gameController.rightPalm].forEach(palm => {
        if (!palm) return;
        const x = ((palm.x * -1) + 1) * cvWidth;
        const y = palm.y * cvHeight;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 20 + 2 * Math.sin(time / 180), 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
        ctx.restore();
    });
}

// Big "3, 2, 1" before a game starts
export function drawCountdown(ctx: any, cvWidth: number, cvHeight: number, remainingMs: number): void {
    const number = Math.ceil(remainingMs / 1000);
    const withinSecond = 1 - (remainingMs % 1000) / 1000;   // 0 when a new number appears
    const scale = 1.5 - 0.5 * Math.min(1, withinSecond * 3);

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, cvWidth, cvHeight);
    ctx.translate(cvWidth / 2, cvHeight / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 1 - Math.max(0, withinSecond - 0.7) / 0.3 * 0.6;
    drawOutlinedText(ctx, String(number), 0, 0, "bold 110pt Arial", "#FFFFFF", 12);
    ctx.restore();
    drawOutlinedText(ctx, t("getReady"), cvWidth / 2, cvHeight / 2 + 110, "bold 26pt Arial");
    // players should always know which difficulty (and score multiplier) they are playing
    drawOutlinedText(ctx, t("difficultyLine", { level: t(settings.difficulty), mult: formatMultiplier(scoreMultiplier()) }),
        cvWidth / 2, cvHeight / 2 + 160, "bold 16pt Arial", DIFFICULTY_COLOR[settings.difficulty], 5);
}

// Hands control back to the menu. Call after the game has cleaned up its loops and extra canvases.
export function returnToMenu(ctx: any, cvWidth: number, cvHeight: number): void {
    ctx.clearRect(0, 0, cvWidth, cvHeight);
    if (!gameController.menuController) return;
    gameController.isInGame = false;
    gameController.menuController.drawMenu();
    // garbage collector
    gameController.menuController.game = null;
}
