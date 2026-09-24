import { MenuElement } from "../../interfaces/MenuElement";
import { GameType } from "../../DataTypes/GameTypes";
import { gameController } from "../../state/gameController";
import { FilterTheTraffic } from "../games/FilterTheTraffic";
import { SaveTheServer } from "../games/SaveTheServer";
import { PatchTheServer } from "../games/PatchTheServer";
import { SettingsPanel } from "./SettingsPanel";
import { DIFFICULTY_COLOR, scoreMultiplier, settings } from "../../state/settings";
import { formatMultiplier, t } from "../../utils/i18n";
import { eventToCanvas } from "../../utils/handInput";
import { cachedDrawing } from "../../utils/sprites";
import { MIN_FRAME_MS } from "../../utils/gameUi";

interface Rect { x: number, y: number, w: number, h: number }
interface HandPoint { x: number, y: number }      // normalized, already mirrored
interface HandSample { t: number, x: number, y: number }

export class Menu {

    // --- tuning ---
    private readonly SIDE_HOLD_MS = 900;          // hold a hand on a side card to scroll to it
    private readonly START_HOLD_MS = 1500;        // hold a hand on the start button to launch
    private readonly SETTINGS_HOLD_MS = 1100;     // hold a hand on the gear button to open the settings
    private readonly SWIPE_MIN_DX = 0.18;         // normalized horizontal travel that counts as a swipe
    private readonly SWIPE_MAX_SLOPE = 0.6;       // |dy| / |dx| above this is not a horizontal swipe
    private readonly SWIPE_WINDOW_MS = 450;
    private readonly SWIPE_COOLDOWN_MS = 900;
    private readonly SWIPE_BAND = { min: 0.12, max: 0.65 };   // swipes only count at carousel height
    private readonly HAND_RADIUS = 0.05;
    private readonly LAUNCH_MS = 500;
    private readonly HINT_SWITCH_MS = 4000;

    // --- layout (canvas pixels) ---
    private readonly CARD_W = 300;
    private readonly CARD_H = 290;
    private readonly CARD_CENTER_Y = 285;
    private readonly SIDE_OFFSET = 330;
    private readonly SIDE_SCALE = 0.72;
    private readonly START_W = 290;
    private readonly START_H = 76;
    private readonly START_CENTER_Y = 530;
    private readonly SETTINGS_RECT: Rect = { x: 716, y: 24, w: 224, h: 62 };

    private cvWidth: number;
    private cvHeight: number;
    private menuList: MenuElement[];
    private ctx: any;
    private icons: HTMLImageElement[];
    private badges: (HTMLImageElement | null)[];

    private animationId = null as number | null;
    private running = false;
    private lastFrameTime = 0;
    private time = 0;              // ms the menu has been on screen, drives the idle animations

    private position = 0;          // animated carousel position (not wrapped)
    private target = 0;            // position the carousel slides towards (not wrapped)

    private leftHoldMs = 0;
    private rightHoldMs = 0;
    private startHoldMs = 0;
    private swipeHistory: HandSample[][] = [[], []];
    private swipeCooldownUntil = 0;
    private swipeFlash = { dir: 0, until: 0 };
    private cursors: (HandPoint | null)[] = [null, null];   // smoothed hand positions for drawing
    private launchStartedAt = null as number | null;
    private settingsHoldMs = 0;
    private settingsPanel: SettingsPanel | null = null;
    private gearImage: HTMLImageElement;
    // after returning to the menu (or closing the settings) the hands must leave every button
    // first, so a hand still resting where the last button was can't trigger a new one
    private holdsLocked = true;

    private descriptionLines = new Map<string, string[]>();   // wrapped once per card and language

    public game: any = undefined;

    constructor(cvWidth: number, cvHeight: number, ctx: any, menuList: MenuElement[]) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.menuList = menuList;
        this.ctx = ctx;

        this.icons = menuList.map(element => this.loadImage(element.icon));
        this.badges = menuList.map(element => element.badge ? this.loadImage(element.badge) : null);
        this.gearImage = this.loadImage("assets/settingsGear.svg");

        // operator shortcuts: arrows to browse, Enter to start, S for settings; mouse/touch works too
        window.addEventListener("keydown", event => this.onKeyDown(event));
        window.addEventListener("pointerdown", event => this.onPointerDown(event));
    }

    private loadImage(src: string): HTMLImageElement {
        const image = new Image();
        image.src = src;
        return image;
    }

    drawMenu() {
        gameController.isInMenu = true;
        if (this.running) return;

        this.running = true;
        this.leftHoldMs = 0;
        this.rightHoldMs = 0;
        this.startHoldMs = 0;
        this.settingsHoldMs = 0;
        this.holdsLocked = true;
        this.settingsPanel = null;
        this.swipeHistory = [[], []];
        this.launchStartedAt = null;
        this.lastFrameTime = performance.now();
        this.animationId = requestAnimationFrame(() => this.menuLoop());
    }

    private menuLoop(): void {
        if (!this.running) return;

        const now = performance.now();
        if (now - this.lastFrameTime < MIN_FRAME_MS) {
            this.animationId = requestAnimationFrame(() => this.menuLoop());
            return;
        }
        const dt = Math.min(now - this.lastFrameTime, 100);
        this.lastFrameTime = now;
        this.time += dt;

        if (this.settingsPanel) {
            this.settingsPanel.update(dt);
            this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
            this.settingsPanel?.draw(this.ctx);     // null when that update closed it
            this.animationId = requestAnimationFrame(() => this.menuLoop());
            return;
        }

        const hands = this.getHands();
        if (this.launchStartedAt === null) {
            this.detectSwipe(hands);
            this.updateHolds(hands, dt);
        }

        // ease the carousel towards its target
        this.position += (this.target - this.position) * (1 - Math.exp(-dt / 90));
        if (Math.abs(this.target - this.position) < 0.001) this.position = this.target;

        this.draw(hands, dt);

        if (this.launchStartedAt !== null && this.time - this.launchStartedAt >= this.LAUNCH_MS) {
            this.initGame();
            return;
        }
        this.animationId = requestAnimationFrame(() => this.menuLoop());
    }

    private get selectedIndex(): number {
        const n = this.menuList.length;
        return ((this.target % n) + n) % n;
    }

    // --- input ---

    private getHands(): (HandPoint | null)[] {
        // null while a hand is out of frame
        return [gameController.leftPalm, gameController.rightPalm]
            .map(hand => hand ? { x: (hand.x * -1) + 1, y: hand.y } : null);
    }

    private detectSwipe(hands: (HandPoint | null)[]): void {
        hands.forEach((hand, i) => {
            const history = this.swipeHistory[i];
            if (!hand || hand.y < this.SWIPE_BAND.min || hand.y > this.SWIPE_BAND.max) {
                history.length = 0;
                return;
            }

            history.push({ t: this.time, x: hand.x, y: hand.y });
            while (this.time - history[0].t > this.SWIPE_WINDOW_MS) history.shift();
            if (this.time < this.swipeCooldownUntil) return;

            const dx = hand.x - history[0].x;
            const dy = hand.y - history[0].y;
            if (Math.abs(dx) >= this.SWIPE_MIN_DX && Math.abs(dy) <= Math.abs(dx) * this.SWIPE_MAX_SLOPE) {
                // moving the hand right brings the right-hand card to the center
                const dir = dx > 0 ? 1 : -1;
                this.scroll(dir);
                this.swipeFlash = { dir: dir, until: this.time + 450 };
                this.swipeCooldownUntil = this.time + this.SWIPE_COOLDOWN_MS;
                this.swipeHistory = [[], []];
            }
        });
    }

    private updateHolds(hands: (HandPoint | null)[], dt: number): void {
        const present = hands.filter(hand => hand !== null) as HandPoint[];
        if (this.holdsLocked) {
            if (present.some(hand => this.isHandOverAnyButton(hand))) return;
            this.holdsLocked = false;
        }
        const hasSides = this.menuList.length > 1;
        const swipeLocked = this.time < this.swipeCooldownUntil;

        const overLeft = hasSides && present.some(hand => this.isHandOverRect(hand, this.sideRect(-1)));
        const overRight = hasSides && present.some(hand => this.isHandOverRect(hand, this.sideRect(1)));
        const overStart = present.some(hand => this.isHandOverRect(hand, this.startRect()));
        const overSettings = present.some(hand => this.isHandOverRect(hand, this.SETTINGS_RECT));

        // progress resets as soon as the hand leaves, so a quick pass never triggers anything
        this.leftHoldMs = overLeft && !swipeLocked ? this.leftHoldMs + dt : 0;
        this.rightHoldMs = overRight && !swipeLocked ? this.rightHoldMs + dt : 0;
        this.startHoldMs = overStart ? this.startHoldMs + dt : 0;
        this.settingsHoldMs = overSettings ? this.settingsHoldMs + dt : 0;

        if (this.settingsHoldMs >= this.SETTINGS_HOLD_MS) {
            this.openSettings();
            return;
        }

        if (this.leftHoldMs >= this.SIDE_HOLD_MS) this.scroll(-1);
        else if (this.rightHoldMs >= this.SIDE_HOLD_MS) this.scroll(1);

        if (this.startHoldMs >= this.START_HOLD_MS) {
            this.startHoldMs = this.START_HOLD_MS;
            this.launch();
        }
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.running || this.launchStartedAt !== null) return;
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

        if (this.settingsPanel) {
            if (event.key === "Escape" || event.key === "Enter" || event.key.toLowerCase() === "s") this.closeSettings();
            return;
        }
        if (event.key.toLowerCase() === "s") this.openSettings();
        else if (event.key === "ArrowLeft") this.scroll(-1);
        else if (event.key === "ArrowRight") this.scroll(1);
        else if (event.key === "Enter") this.launch();
    }

    private onPointerDown(event: PointerEvent): void {
        if (!this.running || this.launchStartedAt !== null) return;
        const point = eventToCanvas(event, this.ctx.canvas, this.cvWidth, this.cvHeight);
        if (!point) return;
        if (this.settingsPanel) {
            this.settingsPanel.pressAt(point.x, point.y);
            return;
        }
        const inside = (rect: Rect) => point.x >= rect.x && point.x <= rect.x + rect.w
            && point.y >= rect.y && point.y <= rect.y + rect.h;
        if (inside(this.SETTINGS_RECT)) this.openSettings();
        else if (inside(this.startRect())) this.launch();
        else if (this.menuList.length > 1 && inside(this.sideRect(-1))) this.scroll(-1);
        else if (this.menuList.length > 1 && inside(this.sideRect(1))) this.scroll(1);
    }

    private openSettings(): void {
        this.settingsHoldMs = 0;
        this.settingsPanel = new SettingsPanel(this.cvWidth, this.cvHeight, () => this.closeSettings());
    }

    private closeSettings(): void {
        this.settingsPanel = null;
        this.holdsLocked = true;
        this.leftHoldMs = 0;
        this.rightHoldMs = 0;
        this.startHoldMs = 0;
        this.settingsHoldMs = 0;
        this.swipeHistory = [[], []];
    }

    private scroll(dir: number): void {
        this.target += dir;
        this.leftHoldMs = 0;
        this.rightHoldMs = 0;
        this.startHoldMs = 0;
    }

    private launch(): void {
        if (this.launchStartedAt === null) this.launchStartedAt = this.time;
    }

    private isHandOverRect(hand: HandPoint, rect: Rect): boolean {
        const minX = rect.x / this.cvWidth;
        const maxX = (rect.x + rect.w) / this.cvWidth;
        const minY = rect.y / this.cvHeight;
        const maxY = (rect.y + rect.h) / this.cvHeight;
        const dx = hand.x - Math.max(minX, Math.min(hand.x, maxX));
        const dy = hand.y - Math.max(minY, Math.min(hand.y, maxY));
        return (dx * dx + dy * dy) < this.HAND_RADIUS * this.HAND_RADIUS;
    }

    private isHandOverAnyButton(hand: HandPoint): boolean {
        const buttons = [this.startRect(), this.SETTINGS_RECT];
        if (this.menuList.length > 1) buttons.push(this.sideRect(-1), this.sideRect(1));
        return buttons.some(rect => this.isHandOverRect(hand, rect));
    }

    private sideRect(side: number): Rect {
        const w = this.CARD_W * this.SIDE_SCALE;
        const h = this.CARD_H * this.SIDE_SCALE;
        const cx = this.cvWidth / 2 + side * this.SIDE_OFFSET;
        return { x: cx - w / 2, y: this.CARD_CENTER_Y - h / 2, w: w, h: h };
    }

    private startRect(): Rect {
        return {
            x: this.cvWidth / 2 - this.START_W / 2,
            y: this.START_CENTER_Y - this.START_H / 2,
            w: this.START_W,
            h: this.START_H
        };
    }

    // --- game start ---

    initGame() {
        this.running = false;
        cancelAnimationFrame(this.animationId as number);
        this.launchStartedAt = null;
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);

        gameController.isInGame = true;
        gameController.isInMenu = false;

        switch (this.menuList[this.selectedIndex].gameType){
            case GameType.SaveTheServer:
                this.game = new SaveTheServer(this.cvWidth, this.cvHeight, this.ctx);
                break
            case GameType.FilterTheTraffic:
                this.game = new FilterTheTraffic(this.cvWidth, this.cvHeight, this.ctx);
                break
            case GameType.PatchTheServer:
                this.game = new PatchTheServer(this.cvWidth, this.cvHeight, this.ctx);
                break
        }
    }

    // --- drawing ---

    private draw(hands: (HandPoint | null)[], dt: number): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);

        const launchProgress = this.launchStartedAt === null ? 0
            : Math.min(1, (this.time - this.launchStartedAt) / this.LAUNCH_MS);
        const fade = 1 - launchProgress;

        this.drawTitle(fade);
        this.drawSettingsButton(fade);
        this.drawCards(launchProgress);
        this.drawSwipeFlash();
        this.drawDots(fade);
        this.drawStartButton(fade);
        this.drawHint(fade);
        if (this.launchStartedAt === null) this.drawCursors(hands, dt);
    }

    // the title only changes with the language: drawn once, then blitted
    private drawTitle(fade: number): void {
        const title = cachedDrawing("menuTitle|" + settings.language, this.cvWidth, 110, ctx => {
            ctx.font = "bold 34pt Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineJoin = "round";
            ctx.lineWidth = 7;
            ctx.strokeStyle = "rgba(0,0,0,0.55)";
            ctx.strokeText(t("chooseGame"), this.cvWidth / 2, 58);
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(t("chooseGame"), this.cvWidth / 2, 58);
            ctx.beginPath();
            ctx.roundRect(this.cvWidth / 2 - 90, 92, 180, 6, [3]);
            ctx.fillStyle = "#ff462d";
            ctx.fill();
        });
        this.ctx.save();
        this.ctx.globalAlpha = fade;
        this.ctx.drawImage(title, 0, 0);
        this.ctx.restore();
    }

    // gear pill in the top-right corner; also shows the current difficulty and language
    private drawSettingsButton(fade: number): void {
        const ctx = this.ctx;
        const { x, y, w, h } = this.SETTINGS_RECT;
        const progress = Math.min(1, this.settingsHoldMs / this.SETTINGS_HOLD_MS);
        const gearX = x + 32;
        const gearY = y + h / 2;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [h / 2]);
        ctx.fillStyle = progress > 0 ? "rgba(15,23,42,0.75)" : "rgba(15,23,42,0.55)";
        ctx.fill();
        ctx.lineWidth = progress > 0 ? 3 : 1.5;
        ctx.strokeStyle = progress > 0 ? "#FFFFFF" : "rgba(255,255,255,0.4)";
        ctx.stroke();

        // gear turns slowly, faster while a hand is holding it
        ctx.save();
        ctx.translate(gearX, gearY);
        ctx.rotate(this.time / (progress > 0 ? 250 : 2500));
        if (this.gearImage.complete && this.gearImage.naturalWidth) ctx.drawImage(this.gearImage, -17, -17, 34, 34);
        ctx.restore();
        if (progress > 0) {
            ctx.beginPath();
            ctx.arc(gearX, gearY, 24, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
            ctx.lineWidth = 5;
            ctx.lineCap = "round";
            ctx.strokeStyle = "#8db600";
            ctx.stroke();
        }

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 14pt Arial";
        ctx.fillText(t("settings"), x + 64, y + 22);
        ctx.font = "bold 11pt Arial";
        ctx.fillStyle = DIFFICULTY_COLOR[settings.difficulty];
        const level = t(settings.difficulty) + " " + formatMultiplier(scoreMultiplier());
        ctx.fillText(level, x + 64, y + 44);
        const levelW = ctx.measureText(level).width;
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("· " + settings.language.toUpperCase(), x + 70 + levelW, y + 44);
        ctx.restore();
    }

    private drawCards(launchProgress: number): void {
        const n = this.menuList.length;
        const cards = this.menuList.map((element, i) => {
            // signed distance from the center slot, wrapped so the carousel loops
            const d = (((i - this.position + n / 2) % n) + n) % n - n / 2;
            return { i: i, d: d };
        });
        // far cards first so the center card is drawn on top
        cards.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

        cards.forEach(({ i, d }) => {
            const dist = Math.abs(d);
            if (dist >= 1.5) return;

            const focus = 1 - Math.min(1, dist);
            let alpha = dist <= 1 ? 1 - 0.3 * dist : 0.7 * (1.5 - dist) / 0.5;
            let scale = 1 - (1 - this.SIDE_SCALE) * Math.min(1, dist);

            if (launchProgress > 0) {
                if (dist < 0.5) {
                    scale *= 1 + 0.25 * launchProgress;
                    alpha *= 1 - launchProgress * launchProgress;
                } else {
                    alpha *= 1 - launchProgress;
                }
            } else if (dist < 0.5) {
                scale *= 1 + 0.012 * Math.sin(this.time / 450);   // idle "breathing"
            }

            this.drawCard(i, this.cvWidth / 2 + d * this.SIDE_OFFSET, this.CARD_CENTER_Y, scale, alpha, focus);
        });

        if (launchProgress === 0 && n > 1) {
            this.drawSideArrow(-1, this.leftHoldMs);
            this.drawSideArrow(1, this.rightHoldMs);
        }
    }

    private drawCard(index: number, cx: number, cy: number, scale: number, alpha: number, focus: number): void {
        const ctx = this.ctx;
        const element = this.menuList[index];
        const w = this.CARD_W;
        const h = this.CARD_H;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);

        // glow on the focused card: baked once per color, faded in with the focus
        if (focus > 0.01) {
            const glow = this.cardGlow(element.color);
            ctx.globalAlpha = alpha * focus;
            ctx.drawImage(glow, -glow.width / 2, -glow.height / 2);
        }
        ctx.globalAlpha = alpha;
        ctx.drawImage(this.cardBody(index), -w / 2, -h / 2);
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, [22]);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(255,255,255," + (0.35 + 0.65 * focus) + ")";
        ctx.stroke();

        const iconY = -55;
        const badge = this.badges[index];
        if (badge) {
            const bob = Math.sin(this.time / 300 + index) * 4 * focus;
            ctx.beginPath();
            ctx.arc(52, iconY + 45 + bob, 27, 0, 2 * Math.PI);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = element.color;
            ctx.stroke();
            this.drawImageFit(ctx, badge, 52, iconY + 45 + bob, 38);
        }

        if (focus > 0.01) {
            ctx.globalAlpha = alpha * focus;
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "13pt Arial";
            this.cardDescription(index).forEach((line, k) => ctx.fillText(line, 0, 86 + k * 22));
        }
        ctx.restore();
    }

    // card background, picture and name; re-baked only once the picture has loaded
    private cardBody(index: number): HTMLCanvasElement {
        const element = this.menuList[index];
        const icon = this.icons[index];
        const loaded = icon.complete && icon.naturalWidth > 0;
        const w = this.CARD_W;
        const h = this.CARD_H;
        return cachedDrawing("menuCard|" + element.gameType + "|" + element.color + "|" + loaded, w, h, ctx => {
            ctx.translate(w / 2, h / 2);
            const gradient = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
            gradient.addColorStop(0, this.shade(element.color, 0.25));
            gradient.addColorStop(1, this.shade(element.color, -0.4));
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h / 2, w, h, [22]);
            ctx.fillStyle = gradient;
            ctx.fill();

            const iconY = -55;
            ctx.beginPath();
            ctx.arc(0, iconY, 68, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.fill();
            if (loaded) this.drawImageFit(ctx, icon, 0, iconY, 96);

            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "bold 22pt Arial";
            ctx.fillText(element.gameType, 0, 45);
        });
    }

    // the glow around a card, without the card itself (shadowBlur runs only here, once)
    private cardGlow(color: string): HTMLCanvasElement {
        const pad = 60;
        const w = this.CARD_W;
        const h = this.CARD_H;
        return cachedDrawing("menuCardGlow|" + color, w + pad * 2, h + pad * 2, ctx => {
            const offset = w + pad * 4;
            ctx.shadowColor = color;
            ctx.shadowBlur = 35;
            ctx.shadowOffsetX = offset;
            ctx.beginPath();
            ctx.roundRect(pad - offset, pad, w, h, [22]);
            ctx.fillStyle = "#000000";
            ctx.fill();
        });
    }

    private cardDescription(index: number): string[] {
        const key = index + "|" + settings.language;
        let lines = this.descriptionLines.get(key);
        if (!lines) {
            this.ctx.save();
            this.ctx.font = "13pt Arial";
            lines = this.wrapText(this.menuList[index].description[settings.language], this.CARD_W - 40);
            this.ctx.restore();
            this.descriptionLines.set(key, lines);
        }
        return lines;
    }

    private drawSideArrow(side: number, holdMs: number): void {
        const ctx = this.ctx;
        const rect = this.sideRect(side);
        const nudge = Math.sin(this.time / 250) * 4 * side;
        const cx = rect.x + rect.w / 2 + nudge;
        const cy = this.CARD_CENTER_Y + 70;
        const radius = 28;
        const progress = Math.min(1, holdMs / this.SIDE_HOLD_MS);

        ctx.save();
        if (progress > 0) {
            // outline the card that is about to slide in
            ctx.beginPath();
            ctx.roundRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8, [20]);
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(255,255,255," + (0.5 + 0.5 * progress) + ")";
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = progress > 0 ? "rgba(141,182,0,0.9)" : "rgba(0,0,0,0.55)";
        ctx.fill();

        // chevron
        ctx.beginPath();
        ctx.moveTo(cx - 6 * side, cy - 12);
        ctx.lineTo(cx + 7 * side, cy);
        ctx.lineTo(cx - 6 * side, cy + 12);
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();

        if (progress > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 6, -Math.PI / 2, -Math.PI / 2 + progress * 2 * Math.PI);
            ctx.lineWidth = 6;
            ctx.strokeStyle = "#FFFFFF";
            ctx.stroke();
        }
        ctx.restore();
    }

    private drawSwipeFlash(): void {
        const remaining = this.swipeFlash.until - this.time;
        if (remaining <= 0) return;

        const ctx = this.ctx;
        const t = 1 - remaining / 450;
        const dir = this.swipeFlash.dir;
        const baseX = this.cvWidth / 2 - dir * 60 + dir * t * 160;

        ctx.save();
        ctx.globalAlpha = 0.8 * (1 - t);
        ctx.lineWidth = 10;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#FFFFFF";
        for (let k = 0; k < 3; k++) {
            const x = baseX + dir * k * 32;
            ctx.beginPath();
            ctx.moveTo(x - 12 * dir, this.CARD_CENTER_Y - 26);
            ctx.lineTo(x + 12 * dir, this.CARD_CENTER_Y);
            ctx.lineTo(x - 12 * dir, this.CARD_CENTER_Y + 26);
            ctx.stroke();
        }
        ctx.restore();
    }

    private drawDots(fade: number): void {
        const ctx = this.ctx;
        const n = this.menuList.length;
        const current = ((Math.round(this.position) % n) + n) % n;
        const spacing = 24;
        const startX = this.cvWidth / 2 - (n - 1) * spacing / 2;
        const y = this.CARD_CENTER_Y + this.CARD_H / 2 + 28;

        ctx.save();
        ctx.globalAlpha = fade;
        for (let i = 0; i < n; i++) {
            ctx.beginPath();
            ctx.arc(startX + i * spacing, y, i === current ? 8 : 5, 0, 2 * Math.PI);
            ctx.fillStyle = i === current ? "#FFFFFF" : "rgba(255,255,255,0.45)";
            ctx.fill();
        }
        ctx.restore();
    }

    private drawStartButton(fade: number): void {
        const ctx = this.ctx;
        const rect = this.startRect();
        const progress = Math.min(1, this.startHoldMs / this.START_HOLD_MS);
        const pulse = progress > 0 ? 1 : 0.5 + 0.5 * Math.sin(this.time / 300);

        ctx.save();
        ctx.globalAlpha = fade;

        // pulsing glow: baked once, faded with alpha instead of animating shadowBlur
        const pad = 50;
        const glow = cachedDrawing("menuStartGlow", rect.w + pad * 2, rect.h + pad * 2, glowCtx => {
            const offset = rect.w + pad * 4;
            glowCtx.shadowColor = "#8db600";
            glowCtx.shadowBlur = 30;
            glowCtx.shadowOffsetX = offset;
            glowCtx.beginPath();
            glowCtx.roundRect(pad - offset, pad, rect.w, rect.h, [rect.h / 2]);
            glowCtx.fillStyle = "#000000";
            glowCtx.fill();
        });
        ctx.globalAlpha = fade * (0.35 + 0.65 * pulse);
        ctx.drawImage(glow, rect.x - pad, rect.y - pad);
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.roundRect(rect.x, rect.y, rect.w, rect.h, [rect.h / 2]);
        ctx.fillStyle = "rgba(52,78,0,0.9)";
        ctx.fill();

        // hold progress fills the button from left to right
        if (progress > 0) {
            ctx.save();
            ctx.clip();
            ctx.fillStyle = "#8db600";
            ctx.fillRect(rect.x, rect.y, rect.w * progress, rect.h);
            ctx.restore();
        }

        ctx.lineWidth = 4;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();

        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 24pt Arial";
        ctx.fillText(t("start"), this.cvWidth / 2, this.START_CENTER_Y);

        ctx.font = "bold 13pt Arial";
        ctx.lineJoin = "round";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        const caption = progress > 0 ? t("almostThere") : t("holdYourHand");
        ctx.strokeText(caption, this.cvWidth / 2, rect.y + rect.h + 22);
        ctx.fillText(caption, this.cvWidth / 2, rect.y + rect.h + 22);
        ctx.restore();
    }

    private drawHint(fade: number): void {
        const ctx = this.ctx;
        const hints = [t("hintSwipe"), t("hintStart"), t("hintSettings")];
        const cycle = this.time / this.HINT_SWITCH_MS;
        const index = Math.floor(cycle) % hints.length;
        // fade the text out and in around each switch
        const phase = cycle - Math.floor(cycle);
        const textAlpha = Math.min(1, phase * 6, (1 - phase) * 6);

        const w = 720;
        const h = 44;
        const y = this.cvHeight - 30 - h;

        ctx.save();
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.roundRect(this.cvWidth / 2 - w / 2, y, w, h, [h / 2]);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fill();

        ctx.globalAlpha = fade * textAlpha;
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "15pt Arial";
        ctx.fillText(hints[index], this.cvWidth / 2, y + h / 2);
        ctx.restore();
    }

    private drawCursors(hands: (HandPoint | null)[], dt: number): void {
        const ctx = this.ctx;
        const smoothing = 1 - Math.exp(-dt / 60);

        hands.forEach((hand, i) => {
            if (!hand) {
                this.cursors[i] = null;
                return;
            }
            const previous = this.cursors[i];
            const cursor = previous
                ? { x: previous.x + (hand.x - previous.x) * smoothing, y: previous.y + (hand.y - previous.y) * smoothing }
                : { x: hand.x, y: hand.y };
            this.cursors[i] = cursor;

            const x = cursor.x * this.cvWidth;
            const y = cursor.y * this.cvHeight;
            const active = this.isHandOverAnyButton(hand);

            ctx.save();
            if (active) {
                ctx.beginPath();
                ctx.arc(x, y, 34 + 4 * Math.sin(this.time / 150), 0, 2 * Math.PI);
                ctx.fillStyle = "rgba(141,182,0,0.35)";
                ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(x, y, 22, 0, 2 * Math.PI);
            ctx.fillStyle = active ? "rgba(141,182,0,0.9)" : "rgba(255,255,255,0.35)";
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = "#FFFFFF";
            ctx.stroke();
            ctx.restore();
        });
    }

    // --- helpers ---

    private drawImageFit(ctx: any, image: HTMLImageElement, cx: number, cy: number, size: number): void {
        if (!image.complete || !image.naturalWidth) return;
        const ratio = image.naturalWidth / image.naturalHeight;
        const w = ratio >= 1 ? size : size * ratio;
        const h = ratio >= 1 ? size / ratio : size;
        ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
    }

    private wrapText(text: string, maxWidth: number): string[] {
        const lines: string[] = [];
        let line = "";
        text.split(" ").forEach(word => {
            const candidate = line ? line + " " + word : word;
            if (line && this.ctx.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        });
        if (line) lines.push(line);
        return lines;
    }

    // mixes a #rrggbb color towards white (amount > 0) or black (amount < 0)
    private shade(hex: string, amount: number): string {
        const value = parseInt(hex.slice(1), 16);
        const mixTo = amount > 0 ? 255 : 0;
        const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
            .map(channel => Math.round(channel + (mixTo - channel) * Math.abs(amount)));
        return "rgb(" + channels.join(",") + ")";
    }
}
