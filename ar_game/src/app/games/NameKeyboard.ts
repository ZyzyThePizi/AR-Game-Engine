import { DwellInput, DwellTarget, Rect } from "../../utils/handInput";
import * as gameUi from "../../utils/gameUi";
import { t } from "../../utils/i18n";

type KeyAction = 'char' | 'space' | 'backspace' | 'toggle' | 'done';

interface Key extends DwellTarget {
    action: KeyAction,
    char: string,
    label: () => string
}

// On-screen keyboard typed with the hands (dwell on a key), a mouse/touch click, or a physical
// keyboard. The key caps never change while a layout is shown, so they are drawn once into an
// offscreen layer; each frame only blits it and draws the hovered key, the name and the cursors.
export class NameKeyboard {

    static readonly MAX_LENGTH = 10;

    // --- tuning ---
    private readonly KEY_HOLD_MS = 800;
    private readonly DONE_HOLD_MS = 1400;       // longer, so a passing hand never submits by accident
    private readonly PRESS_FLASH_MS = 220;

    // --- layout (canvas px); keys stay above ~83% of the height, where resting hands hang ---
    private readonly TOP = 212;
    private readonly LEFT = 25;
    private readonly KEY_W = 82;
    private readonly KEY_H = 66;
    private readonly GAP = 10;
    private readonly FIELD: Rect = { x: 205, y: 146, w: 550, h: 54 };

    private readonly LETTER_ROWS = ["QWERTZUIOP", "ASDFGHJKLÉ", "YXCVBNMÁÖÜ"];
    private readonly EXTRA_ROWS = { accents: "ÍÓŐÚŰ-.", digits: "1234567890" };

    name = "";
    private showDigits = false;
    private keys: Key[] = [];
    private layer: { canvas: HTMLCanvasElement, ctx: any };
    private input: DwellInput;
    private flash: { key: Key, until: number } | null = null;
    private time = 0;

    constructor(private cvWidth: number, private cvHeight: number, private onDone: (name: string) => void) {
        this.input = new DwellInput(cvWidth, cvHeight);
        this.layer = gameUi.createLayer(cvWidth, cvHeight);
        this.buildKeys();
    }

    // --- input ---

    update(dt: number): void {
        this.time += dt;
        const fired = this.input.update(dt, this.keys);
        if (fired) this.press(this.keys.find(key => key.id === fired)!);
    }

    // mouse / touch
    pressAt(x: number, y: number): void {
        const key = this.keys.find(key => x >= key.rect.x && x <= key.rect.x + key.rect.w
            && y >= key.rect.y && y <= key.rect.y + key.rect.h);
        if (key) this.press(key);
    }

    // physical keyboard, still handy for the operator
    onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Enter") this.onDone(this.name);
        else if (event.key === "Backspace") this.name = this.name.slice(0, -1);
        else if (event.key.length === 1 && /[\p{L}\p{N} .\-]/u.test(event.key)) this.typeChar(event.key.toUpperCase());
        else return;
        event.preventDefault();
    }

    private press(key: Key): void {
        this.flash = { key: key, until: this.time + this.PRESS_FLASH_MS };
        switch (key.action) {
            case 'char': this.typeChar(key.char); break;
            case 'space': if (this.name && !this.name.endsWith(" ")) this.typeChar(" "); break;
            case 'backspace': this.name = this.name.slice(0, -1); break;
            case 'toggle':
                this.showDigits = !this.showDigits;
                this.buildKeys();
                break;
            case 'done': this.onDone(this.name); break;
        }
    }

    private typeChar(char: string): void {
        if (this.name.length < NameKeyboard.MAX_LENGTH) this.name += char;
    }

    // --- layout ---

    private buildKeys(): void {
        const extra = this.showDigits ? this.EXTRA_ROWS.digits : this.EXTRA_ROWS.accents;
        const rows = [...this.LETTER_ROWS, extra];
        this.keys = [];

        rows.forEach((row, r) => {
            const rowWidth = row.length * this.KEY_W + (row.length - 1) * this.GAP;
            const startX = this.cvWidth / 2 - rowWidth / 2;
            [...row].forEach((char, c) => this.keys.push({
                id: "k" + r + "_" + char,
                action: 'char',
                char: char,
                label: () => char,
                holdMs: this.KEY_HOLD_MS,
                rect: { x: startX + c * (this.KEY_W + this.GAP), y: this.rowY(r), w: this.KEY_W, h: this.KEY_H }
            }));
        });

        // bottom row in "key units": toggle 1.5, space 4, backspace 1.5, done 3 (= one full row)
        const actions: { action: KeyAction, units: number, label: () => string }[] = [
            { action: 'toggle', units: 1.5, label: () => this.showDigits ? "ÁÉŐ" : "123" },
            { action: 'space', units: 4, label: () => t("keySpace") },
            { action: 'backspace', units: 1.5, label: () => "⌫" },
            { action: 'done', units: 3, label: () => t("keyDone") }
        ];
        let x = this.LEFT;
        actions.forEach(item => {
            const w = item.units * this.KEY_W + (item.units - 1) * this.GAP;
            this.keys.push({
                id: item.action,
                action: item.action,
                char: "",
                label: item.label,
                holdMs: item.action === 'done' ? this.DONE_HOLD_MS : this.KEY_HOLD_MS,
                rect: { x: x, y: this.rowY(rows.length), w: w, h: this.KEY_H }
            });
            x += w + this.GAP;
        });

        this.renderLayer();
    }

    private rowY(row: number): number {
        return this.TOP + row * (this.KEY_H + this.GAP);
    }

    // --- drawing ---

    private renderLayer(): void {
        const ctx = this.layer.ctx;
        ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.keys.forEach(key => {
            const { x, y, w, h } = key.rect;
            const isDone = key.action === 'done';
            gameUi.drawGlass(ctx, x, y, w, h, 14,
                isDone ? "rgba(141,182,0,0.55)" : key.action === 'char' ? gameUi.GLASS.key : "rgba(255,255,255,0.18)",
                isDone ? "rgba(214,255,120,0.8)" : gameUi.GLASS.border);
            ctx.fillStyle = "#FFFFFF";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = key.action === 'char' ? "bold 24pt Arial" : "bold 16pt Arial";
            ctx.fillText(key.label(), x + w / 2, y + h / 2 + 1);
        });
    }

    draw(ctx: any): void {
        this.drawField(ctx);
        ctx.drawImage(this.layer.canvas, 0, 0);
        this.keys.forEach(key => {
            if (this.input.isHovered(key.id)) this.drawHover(ctx, key);
        });
        if (this.flash && this.time < this.flash.until) {
            const { x, y, w, h } = this.flash.key.rect;
            ctx.save();
            ctx.globalAlpha = (this.flash.until - this.time) / this.PRESS_FLASH_MS;
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, [14]);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();
            ctx.restore();
        }

        gameUi.drawOutlinedText(ctx, t("keyboardHint"), this.cvWidth / 2, this.rowY(5) + 14,
            "13pt Arial", "rgba(255,255,255,0.85)", 4);
        this.input.drawCursors(ctx, this.time);
    }

    // hovered key lifts and fills up from the bottom while the hand rests on it
    private drawHover(ctx: any, key: Key): void {
        const { x, y, w, h } = key.rect;
        const progress = this.input.progressOf(key);
        const accent = key.action === 'done' ? "#d4ff78" : gameUi.COLORS.brand;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x - 3, y - 3, w + 6, h + 6, [16]);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(x - 3, y + h + 3 - (h + 6) * progress, w + 6, (h + 6) * progress);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FFFFFF";
        ctx.stroke();

        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = key.action === 'char' ? "bold 28pt Arial" : "bold 17pt Arial";
        ctx.fillText(key.label(), x + w / 2, y + h / 2 + 1);
        ctx.restore();
    }

    private drawField(ctx: any): void {
        const { x, y, w, h } = this.FIELD;
        gameUi.drawGlass(ctx, x, y, w, h, h / 2, "rgba(15,23,42,0.65)", "rgba(255,255,255,0.6)");

        ctx.save();
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        const cy = y + h / 2 + 1;
        if (this.name) {
            ctx.font = "bold 24pt Arial";
            ctx.fillStyle = "#FFFFFF";
            ctx.fillText(this.name, x + w / 2, cy);
        } else {
            ctx.font = "bold 18pt Arial";
            ctx.fillStyle = "rgba(255,255,255,0.55)";
            ctx.fillText(t("enterName"), x + w / 2, cy);
        }

        // blinking caret after the text
        if (Math.floor(this.time / 500) % 2 === 0) {
            ctx.font = "bold 24pt Arial";
            const textW = this.name ? ctx.measureText(this.name).width : 0;
            const caretX = this.name ? x + w / 2 + textW / 2 + 4 : x + 40;
            ctx.fillStyle = gameUi.COLORS.brand;
            ctx.fillRect(caretX, cy - 16, 3, 32);
        }

        ctx.font = "bold 12pt Arial";
        ctx.textAlign = "right";
        ctx.fillStyle = this.name.length >= NameKeyboard.MAX_LENGTH ? gameUi.COLORS.brand : "rgba(255,255,255,0.7)";
        ctx.fillText(this.name.length + "/" + NameKeyboard.MAX_LENGTH, x + w - 22, cy);
        ctx.restore();
    }
}
