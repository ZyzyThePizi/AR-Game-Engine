import { gameController } from "../state/gameController";

// Hand-driven buttons for screens outside the games (keyboard, leaderboard, settings).
// Everything here works in canvas pixels of the fixed 960x720 world.

export interface Point { x: number, y: number }
export interface Rect { x: number, y: number, w: number, h: number }

export interface DwellTarget {
    id: string,
    rect: Rect,
    holdMs: number,
    pad?: number        // extra forgiving margin around the rect, in px
}

// Both hand points in canvas pixels, mirrored like the video; null when a hand is out of frame.
export function getHandPoints(cvWidth: number, cvHeight: number): (Point | null)[] {
    return [gameController.leftPalm, gameController.rightPalm]
        .map(hand => hand ? { x: ((hand.x * -1) + 1) * cvWidth, y: hand.y * cvHeight } : null);
}

export function pointInRect(point: Point, rect: Rect, pad: number = 0): boolean {
    return point.x >= rect.x - pad && point.x <= rect.x + rect.w + pad
        && point.y >= rect.y - pad && point.y <= rect.y + rect.h + pad;
}

// Canvas pixel under a mouse/touch event. The stage is CSS-scaled, so map through the canvas' on-screen box.
export function eventToCanvas(event: MouseEvent, canvas: HTMLCanvasElement, cvWidth: number, cvHeight: number): Point | null {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const point = {
        x: (event.clientX - box.left) / box.width * cvWidth,
        y: (event.clientY - box.top) / box.height * cvHeight
    };
    return point.x >= 0 && point.x <= cvWidth && point.y >= 0 && point.y <= cvHeight ? point : null;
}

// 1€ filter (Casiez et al.): smooths hard while the hand is still (no jitter on a key) and
// barely at all while it moves fast (no lag when crossing the screen).
class OneEuroFilter {
    private x: number | null = null;
    private dx = 0;

    constructor(private minCutoff: number, private beta: number, private dCutoff: number = 1) {}

    filter(value: number, dtSeconds: number): number {
        if (this.x === null || dtSeconds <= 0) {
            this.x = value;
            return value;
        }
        const rawDx = (value - this.x) / dtSeconds;
        this.dx += this.alpha(this.dCutoff, dtSeconds) * (rawDx - this.dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
        this.x += this.alpha(cutoff, dtSeconds) * (value - this.x);
        return this.x;
    }

    private alpha(cutoff: number, dtSeconds: number): number {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dtSeconds);
    }
}

interface HandCursor {
    filterX: OneEuroFilter,
    filterY: OneEuroFilter,
    raw: { x: number, y: number } | null,   // last landmark sample, to filter each camera frame once
    sinceSampleMs: number,
    filtered: Point,
    shown: Point,                           // eased towards `filtered` every render frame
    lostMs: number,
    armed: boolean,
    armOrigin: Point
}

// Dwell selection: a target fires after a hand rests on it for `holdMs`.
// - Each hand is filtered with a 1€ filter, and a key keeps a hand's focus while the hand
//   stays within STICKY_PAD of it, so jitter on a key edge never jumps to the neighbor.
// - A short tracking dropout (GRACE_MS) keeps the progress instead of restarting it.
// - Holding on after a fire repeats only after REPEAT_DELAY_MS more.
// - A hand already on screen when the input starts (or after reset) is not armed until it
//   moves ARM_DISTANCE px, so a hand resting where the game ended can't type by accident.
//   Each hand arms on its own; a hand appearing later than ARM_WINDOW_MS is armed immediately.
export class DwellInput {

    private readonly REPEAT_DELAY_MS = 450;
    private readonly STICKY_PAD = 18;
    private readonly GRACE_MS = 220;
    private readonly ARM_DISTANCE = 60;
    private readonly DISPLAY_EASE_MS = 35;
    private readonly ARM_WINDOW_MS = 1000;

    private hands: (HandCursor | null)[] = [null, null];
    private focus: (string | null)[] = [null, null];
    private progress: Record<string, number> = {};
    private awayMs: Record<string, number> = {};
    private sinceResetMs = 0;

    constructor(private cvWidth: number, private cvHeight: number) {}

    get cursors(): (Point | null)[] {
        return this.hands.map(hand => hand && hand.lostMs === 0 ? hand.shown : null);
    }

    // Returns the id of the target that fired this frame, if any.
    update(dt: number, targets: DwellTarget[]): string | null {
        this.updateHands(dt);

        const held = new Set<string>();
        this.hands.forEach((hand, i) => {
            if (!hand || !hand.armed) {
                this.focus[i] = null;
                return;
            }
            if (hand.lostMs > 0) {          // tracking dropout: keep the focus a moment
                if (this.focus[i]) held.add(this.focus[i]!);
                return;
            }
            const current = targets.find(target => target.id === this.focus[i]);
            if (!current || !pointInRect(hand.filtered, current.rect, (current.pad ?? 0) + this.STICKY_PAD)) {
                const next = targets.find(target => pointInRect(hand.filtered, target.rect, target.pad ?? 0));
                this.focus[i] = next ? next.id : null;
            }
            if (this.focus[i]) held.add(this.focus[i]!);
        });

        let fired: string | null = null;
        targets.forEach(target => {
            const id = target.id;
            if (!held.has(id)) {
                if (!(id in this.progress)) return;
                this.awayMs[id] = (this.awayMs[id] ?? 0) + dt;
                if (this.awayMs[id] > this.GRACE_MS) {
                    delete this.progress[id];
                    delete this.awayMs[id];
                }
                return;
            }
            delete this.awayMs[id];
            let value = (this.progress[id] ?? 0) + dt;
            if (value >= target.holdMs && fired === null) {
                fired = id;
                value = -this.REPEAT_DELAY_MS;
            }
            this.progress[id] = value;
        });
        return fired;
    }

    // 0-1 fill for drawing the hold ring/bar
    progressOf(target: DwellTarget): number {
        return Math.max(0, Math.min(1, (this.progress[target.id] ?? 0) / target.holdMs));
    }

    // a hand is focusing this target right now
    isHovered(id: string): boolean {
        return this.focus.includes(id);
    }

    reset(): void {
        this.progress = {};
        this.awayMs = {};
        this.focus = [null, null];
        this.sinceResetMs = 0;
        this.hands.forEach(hand => {
            if (!hand) return;
            hand.armed = false;
            hand.armOrigin = hand.filtered;
        });
    }

    drawCursors(ctx: any, time: number): void {
        this.hands.forEach((hand, i) => {
            if (!hand || hand.lostMs > 0) return;
            const { x, y } = hand.shown;
            const active = hand.armed && this.focus[i] !== null;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, 16 + 2 * Math.sin(time / 160), 0, 2 * Math.PI);
            ctx.globalAlpha = hand.armed ? 1 : 0.5;     // unarmed hands look faded until they move
            ctx.fillStyle = active ? "rgba(141,182,0,0.45)" : "rgba(255,255,255,0.25)";
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#FFFFFF";
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
            ctx.restore();
        });
    }

    private updateHands(dt: number): void {
        const inArmWindow = this.sinceResetMs < this.ARM_WINDOW_MS;
        this.sinceResetMs += dt;
        const landmarks = [gameController.leftPalm, gameController.rightPalm];

        landmarks.forEach((landmark, i) => {
            let hand = this.hands[i];
            if (!landmark) {
                if (hand) {
                    hand.lostMs += dt;
                    if (hand.lostMs > this.GRACE_MS) this.hands[i] = null;
                }
                return;
            }

            const point = { x: ((landmark.x * -1) + 1) * this.cvWidth, y: landmark.y * this.cvHeight };
            if (!hand) {
                // a hand entering the picture is deliberate, except right after the screen opened
                hand = {
                    filterX: new OneEuroFilter(1.2, 0.02), filterY: new OneEuroFilter(1.2, 0.02),
                    raw: null, sinceSampleMs: 0, filtered: point, shown: point, lostMs: 0,
                    armed: !inArmWindow, armOrigin: point
                };
                this.hands[i] = hand;
            }
            hand.lostMs = 0;
            hand.sinceSampleMs += dt;

            // the pose model runs slower than the screen: filter only when a new sample arrives
            if (landmark !== hand.raw) {
                hand.filtered = {
                    x: hand.filterX.filter(point.x, hand.sinceSampleMs / 1000),
                    y: hand.filterY.filter(point.y, hand.sinceSampleMs / 1000)
                };
                hand.raw = landmark;
                hand.sinceSampleMs = 0;
            }
            const ease = 1 - Math.exp(-dt / this.DISPLAY_EASE_MS);
            hand.shown = {
                x: hand.shown.x + (hand.filtered.x - hand.shown.x) * ease,
                y: hand.shown.y + (hand.filtered.y - hand.shown.y) * ease
            };

            if (!hand.armed && Math.hypot(hand.filtered.x - hand.armOrigin.x, hand.filtered.y - hand.armOrigin.y) > this.ARM_DISTANCE) {
                hand.armed = true;
            }
        });
    }
}
