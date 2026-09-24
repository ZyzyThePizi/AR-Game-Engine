import { createLayer } from "./gameUi";

export type PowerUpKind = 'time' | 'freeze' | 'hotfix' | 'repair';

export const POWER_UP_COLORS: Record<PowerUpKind, string> = {
    time: "#facc15",
    freeze: "#38bdf8",
    hotfix: "#f43f5e",
    repair: "#22c55e"
};

const ICONS: Record<PowerUpKind, string> = {
    time: "assets/powerStopwatch.svg",
    freeze: "assets/powerFreeze.svg",
    hotfix: "assets/powerHotfix.svg",
    repair: "assets/powerRepair.svg"
};

const SPRITE_RADIUS = 40;       // bubble radius the sprites are drawn at; scaled when drawn
const GLOW = 14;

// Glowing pickup bubbles, shared by every game so power-ups always look the same.
// Each kind's bubble + icon is drawn once into a small offscreen sprite (the glow is
// layered circles, not shadowBlur); per frame it is just a scaled drawImage.
export class PowerUpArt {

    private images: Partial<Record<PowerUpKind, HTMLImageElement>> = {};
    private sprites: Partial<Record<PowerUpKind, HTMLCanvasElement>> = {};

    constructor(kinds: PowerUpKind[]) {
        kinds.forEach(kind => {
            const image = new Image();
            image.onload = () => this.sprites[kind] = this.renderSprite(kind, image);
            image.src = ICONS[kind];
            this.images[kind] = image;
        });
    }

    // lifeLeft: 0-1 of the time the pickup stays on screen; it blinks for the last 30 %
    draw(ctx: any, kind: PowerUpKind, x: number, y: number, radius: number, time: number, lifeLeft: number | null = null): void {
        const sprite = this.sprites[kind];
        const pulse = 1 + 0.07 * Math.sin(time / 170);
        const blinkOff = lifeLeft !== null && lifeLeft < 0.3 && Math.floor(time / 130) % 2 === 0;

        ctx.save();
        ctx.globalAlpha = blinkOff ? 0.35 : 1;
        if (sprite) {
            const size = sprite.width * radius / SPRITE_RADIUS * pulse;
            ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = POWER_UP_COLORS[kind];
            ctx.fill();
        }

        // ring that runs down while the pickup waits to be grabbed
        if (lifeLeft !== null) {
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(x, y, radius * pulse + 7, -Math.PI / 2, -Math.PI / 2 + Math.max(0, lifeLeft) * 2 * Math.PI);
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.strokeStyle = "#FFFFFF";
            ctx.stroke();
        }
        ctx.restore();
    }

    private renderSprite(kind: PowerUpKind, icon: HTMLImageElement): HTMLCanvasElement {
        const size = (SPRITE_RADIUS + GLOW) * 2;
        const { canvas, ctx } = createLayer(size, size);
        const c = size / 2;
        const color = POWER_UP_COLORS[kind];

        // soft glow from stacked translucent circles
        [[GLOW, 0.12], [GLOW * 0.6, 0.2], [GLOW * 0.25, 0.3]].forEach(([extra, alpha]) => {
            ctx.beginPath();
            ctx.arc(c, c, SPRITE_RADIUS + extra, 0, 2 * Math.PI);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // glassy bubble
        const gradient = ctx.createRadialGradient(c - 12, c - 14, 4, c, c, SPRITE_RADIUS);
        gradient.addColorStop(0, "rgba(255,255,255,0.95)");
        gradient.addColorStop(0.55, "rgba(255,255,255,0.55)");
        gradient.addColorStop(1, color);
        ctx.beginPath();
        ctx.arc(c, c, SPRITE_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();

        const iconSize = SPRITE_RADIUS * 1.35;
        ctx.drawImage(icon, c - iconSize / 2, c - iconSize / 2, iconSize, iconSize);

        // highlight glint
        ctx.beginPath();
        ctx.ellipse(c - 14, c - 20, 10, 5, -0.6, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fill();
        return canvas;
    }
}
