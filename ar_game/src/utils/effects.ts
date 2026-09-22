interface Particle { x: number, y: number, vx: number, vy: number, life: number, maxLife: number, color: string, size: number }
interface FloatingText { x: number, y: number, text: string, color: string, life: number, maxLife: number }

// Short-lived particles and "+100"-style texts. Call update(dt) and draw(ctx) every frame.
export class Effects {

    private particles: Particle[] = [];
    private texts: FloatingText[] = [];

    burst(x: number, y: number, color: string, count: number = 16): void {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 80 + Math.random() * 220;
            const life = 450 + Math.random() * 350;
            this.particles.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 60,
                life: life, maxLife: life,
                color: color,
                size: 3 + Math.random() * 4
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

    clear(): void {
        this.particles = [];
        this.texts = [];
    }
}
