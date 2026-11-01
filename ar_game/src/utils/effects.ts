import { isMikulas } from "../state/settings";
import { cachedDrawing } from "./sprites";

interface Particle { x: number, y: number, vx: number, vy: number, life: number, maxLife: number, color: string, size: number, star: boolean }
interface FloatingText { x: number, y: number, text: string, color: string, life: number, maxLife: number }

// colors that mean "bad" (a hit, a server going down): never turned into festive sparkles
const PLAIN_COLORS = ["#d62828", "#333333"];
const SPARKLE_COLORS = ["#ffffff", "#facc15"];
const STAR_SPRITE_SIZE = 32;

// Short-lived particles and "+100"-style texts. Call update(dt) and draw(ctx) every frame.
// In the Mikulás theme good bursts become stars and gold/white sparkles.
export class Effects {

    private particles: Particle[] = [];
    private texts: FloatingText[] = [];
    private festive = isMikulas();

    burst(x: number, y: number, color: string, count: number = 16): void {
        const festive = this.festive && !PLAIN_COLORS.includes(color);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 80 + Math.random() * 220;
            const life = 450 + Math.random() * 350;
            this.particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 60,
                life: life, maxLife: life,
                color: festive && Math.random() < 0.4 ? SPARKLE_COLORS[i % 2] : color,
                size: 3 + Math.random() * 4,
                star: festive && Math.random() < 0.6
            });
        }
    }

    floatText(x: number, y: number, text: string, color: string): void {
        this.texts.push({ x: x, y: y, text: text, color: color, life: 900, maxLife: 900 });
    }

    update(dt: number): void {
        const seconds = dt / 1000;
        this.particles.forEach(p => {
            p.x += p.vx * seconds;
            p.y += p.vy * seconds;
            p.vy += 400 * seconds;
            p.life -= dt;
        });
        this.texts.forEach(t => {
            t.y -= 60 * seconds;
            t.life -= dt;
        });
        this.particles = this.particles.filter(p => p.life > 0);
        this.texts = this.texts.filter(t => t.life > 0);
    }

    draw(ctx: any): void {
        ctx.save();
        this.particles.forEach(p => {
            ctx.globalAlpha = p.life / p.maxLife;
            if (p.star) {
                const size = p.size * 3.2;
                ctx.drawImage(this.starSprite(p.color), p.x - size / 2, p.y - size / 2, size, size);
                return;
            }
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, 2 * Math.PI);
            ctx.fillStyle = p.color;
            ctx.fill();
        });

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 24pt Arial";
        ctx.lineJoin = "round";
        ctx.lineWidth = 6;
        this.texts.forEach(t => {
            ctx.globalAlpha = Math.min(1, t.life / 300);
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, t.x, t.y);
        });
        ctx.restore();
    }

    // five-pointed star, drawn once per color
    private starSprite(color: string): HTMLCanvasElement {
        return cachedDrawing("fxStar|" + color, STAR_SPRITE_SIZE, STAR_SPRITE_SIZE, ctx => {
            const c = STAR_SPRITE_SIZE / 2;
            ctx.beginPath();
            for (let k = 0; k < 10; k++) {
                const r = k % 2 === 0 ? c - 1 : c * 0.42;
                const angle = -Math.PI / 2 + k * Math.PI / 5;
                ctx.lineTo(c + Math.cos(angle) * r, c + Math.sin(angle) * r);
            }
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.stroke();
        });
    }

    clear(): void {
        this.particles = [];
        this.texts = [];
    }
}
