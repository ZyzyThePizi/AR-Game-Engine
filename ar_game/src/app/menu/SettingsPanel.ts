import { DwellInput, DwellTarget, pointInRect } from "../../utils/handInput";
import * as gameUi from "../../utils/gameUi";
import { formatMultiplier, t } from "../../utils/i18n";
import {
    DIFFICULTIES, DIFFICULTY_COLOR, Difficulty, DIFFICULTY_MULTIPLIER, Language, LANGUAGES,
    setDifficulty, setLanguage, setTheme, settings, Theme, THEMES
} from "../../state/settings";

interface Option extends DwellTarget {
    select: () => void,
    isSelected: () => boolean
}

// Settings overlay opened from the menu's gear button: language, theme and difficulty, chosen by
// holding a hand on an option (or clicking it). The panel is redrawn into an offscreen layer
// only when a setting changes; each frame just blits it and adds the hover progress.
export class SettingsPanel {

    private readonly OPTION_HOLD_MS = 900;
    private readonly DONE_HOLD_MS = 1000;

    // --- layout (canvas px); everything stays above ~83% of the height, where resting hands hang ---
    private readonly PANEL = { x: 110, y: 34, w: 740, h: 560 };
    private readonly LANGUAGE_NAMES: Record<Language, string> = { hu: "Magyar", en: "English" };
    private readonly THEME_ICONS: Record<Theme, string> = { classic: "assets/server.svg", mikulas: "assets/mikulas/hat.svg" };
    private readonly THEME_COLORS: Record<Theme, string> = { classic: gameUi.COLORS.brand, mikulas: "#dc2626" };

    private input: DwellInput;
    private layer: { canvas: HTMLCanvasElement, ctx: any };
    private options: Option[];
    private gearImage: HTMLImageElement;
    private themeImages: Record<Theme, HTMLImageElement>;
    private time = 0;

    constructor(private cvWidth: number, private cvHeight: number, private onClose: () => void) {
        this.input = new DwellInput(cvWidth, cvHeight);
        this.layer = gameUi.createLayer(cvWidth, cvHeight);
        this.gearImage = new Image();
        this.gearImage.src = "assets/settingsGear.svg";
        this.gearImage.onload = () => this.render();
        this.themeImages = {
            classic: this.loadImage(this.THEME_ICONS.classic),
            mikulas: this.loadImage(this.THEME_ICONS.mikulas)
        };
        this.options = this.buildOptions();
        this.render();
    }

    private loadImage(src: string): HTMLImageElement {
        const image = new Image();
        image.onload = () => this.render();
        image.src = src;
        return image;
    }

    private buildOptions(): Option[] {
        const left = this.PANEL.x + 40;
        const inner = this.PANEL.w - 80;

        const languageW = (inner - 20) / 2;
        const languages = LANGUAGES.map((language, i): Option => ({
            id: "lang_" + language,
            rect: { x: left + i * (languageW + 20), y: 150, w: languageW, h: 64 },
            holdMs: this.OPTION_HOLD_MS,
            select: () => setLanguage(language),
            isSelected: () => settings.language === language
        }));

        const themes = THEMES.map((theme, i): Option => ({
            id: "theme_" + theme,
            rect: { x: left + i * (languageW + 20), y: 254, w: languageW, h: 64 },
            holdMs: this.OPTION_HOLD_MS,
            select: () => setTheme(theme),
            isSelected: () => settings.theme === theme
        }));

        const difficultyW = (inner - 40) / 3;
        const difficulties = DIFFICULTIES.map((difficulty, i): Option => ({
            id: "diff_" + difficulty,
            rect: { x: left + i * (difficultyW + 20), y: 358, w: difficultyW, h: 118 },
            holdMs: this.OPTION_HOLD_MS,
            select: () => setDifficulty(difficulty),
            isSelected: () => settings.difficulty === difficulty
        }));

        const done: Option = {
            id: "done",
            rect: { x: this.cvWidth / 2 - 140, y: 518, w: 280, h: 58 },
            holdMs: this.DONE_HOLD_MS,
            select: () => this.onClose(),
            isSelected: () => false
        };
        return [...languages, ...themes, ...difficulties, done];
    }

    reset(): void {
        this.input.reset();
        this.render();
    }

    update(dt: number): void {
        this.time += dt;
        const fired = this.input.update(dt, this.options);
        if (fired) this.choose(this.options.find(option => option.id === fired)!);
    }

    pressAt(x: number, y: number): void {
        const option = this.options.find(option => pointInRect({ x: x, y: y }, option.rect));
        if (option) this.choose(option);
    }

    private choose(option: Option): void {
        option.select();
        if (option.id !== "done") this.render();
    }

    // --- drawing ---

    draw(ctx: any): void {
        ctx.drawImage(this.layer.canvas, 0, 0);
        this.options.forEach(option => {
            if (!this.input.isHovered(option.id)) return;
            const { x, y, w, h } = option.rect;
            const progress = this.input.progressOf(option);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, [18]);
            ctx.fillStyle = "rgba(255,255,255,0.12)";
            ctx.fill();
            ctx.clip();
            // hold progress sweeps in from the left
            ctx.fillStyle = "rgba(255,255,255,0.22)";
            ctx.fillRect(x, y, w * progress, h);
            ctx.lineWidth = 6;
            ctx.strokeStyle = "#FFFFFF";
            ctx.stroke();
            ctx.restore();
        });
        this.input.drawCursors(ctx, this.time);
    }

    private render(): void {
        const ctx = this.layer.ctx;
        const { x, y, w, h } = this.PANEL;
        ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        ctx.fillStyle = gameUi.GLASS.veil;
        ctx.fillRect(0, 0, this.cvWidth, this.cvHeight);
        gameUi.drawGlass(ctx, x, y, w, h, 28, "rgba(15,23,42,0.62)");

        // title with the gear icon
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.font = "bold 26pt Arial";
        const title = t("settings");
        const titleW = ctx.measureText(title).width;
        const titleX = this.cvWidth / 2 - (titleW + 52) / 2;
        if (this.gearImage.complete && this.gearImage.naturalWidth) {
            ctx.drawImage(this.gearImage, titleX, 64, 40, 40);
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(title, titleX + 52, 85);

        this.drawSectionLabel(ctx, t("language"), 136);
        this.drawSectionLabel(ctx, t("theme"), 240);
        this.drawSectionLabel(ctx, t("difficulty"), 344);

        this.options.forEach(option => {
            if (option.id.startsWith("lang_")) this.renderLanguage(ctx, option, option.id.slice(5) as Language);
            else if (option.id.startsWith("theme_")) this.renderTheme(ctx, option, option.id.slice(6) as Theme);
            else if (option.id.startsWith("diff_")) this.renderDifficulty(ctx, option, option.id.slice(5) as Difficulty);
            else this.renderDone(ctx, option);
        });

        ctx.textAlign = "center";
        ctx.font = "12pt Arial";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(t("multiplierInfo"), this.cvWidth / 2, 496);
    }

    private drawSectionLabel(ctx: any, text: string, y: number): void {
        ctx.textAlign = "left";
        ctx.font = "bold 12pt Arial";
        ctx.fillStyle = "rgba(255,255,255,0.65)";
        ctx.fillText(text.toUpperCase(), this.PANEL.x + 44, y);
    }

    private renderOptionFrame(ctx: any, option: Option, color: string): void {
        const { x, y, w, h } = option.rect;
        const selected = option.isSelected();
        gameUi.drawGlass(ctx, x, y, w, h, 18,
            selected ? this.withAlpha(color, 0.35) : "rgba(255,255,255,0.08)",
            selected ? "#FFFFFF" : gameUi.GLASS.border);
        if (!selected) return;

        // check badge in the top-right corner
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, [18]);
        ctx.stroke();
        const cx = x + w - 20;
        const cy = y + 20;
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy);
        ctx.lineTo(cx - 1, cy + 5);
        ctx.lineTo(cx + 6, cy - 5);
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();
    }

    private renderLanguage(ctx: any, option: Option, language: Language): void {
        const { x, y, w, h } = option.rect;
        this.renderOptionFrame(ctx, option, gameUi.COLORS.brand);

        const cy = y + h / 2;
        ctx.beginPath();
        ctx.arc(x + 48, cy, 24, 0, 2 * Math.PI);
        ctx.fillStyle = option.isSelected() ? gameUi.COLORS.brand : "rgba(255,255,255,0.18)";
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.font = "bold 13pt Arial";
        ctx.fillText(language.toUpperCase(), x + 48, cy + 1);
        ctx.textAlign = "left";
        ctx.font = "bold 20pt Arial";
        ctx.fillText(this.LANGUAGE_NAMES[language], x + 88, cy + 1);
    }

    private renderTheme(ctx: any, option: Option, theme: Theme): void {
        const { x, y, h } = option.rect;
        const color = this.THEME_COLORS[theme];
        this.renderOptionFrame(ctx, option, color);

        const cy = y + h / 2;
        ctx.beginPath();
        ctx.arc(x + 48, cy, 24, 0, 2 * Math.PI);
        ctx.fillStyle = option.isSelected() ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.18)";   // white, so the red hat stands out
        ctx.fill();
        const icon = this.themeImages[theme];
        if (icon.complete && icon.naturalWidth) {
            const size = 34;
            const ratio = icon.naturalWidth / icon.naturalHeight;
            const w = ratio >= 1 ? size : size * ratio;
            const iconH = ratio >= 1 ? size / ratio : size;
            ctx.drawImage(icon, x + 48 - w / 2, cy - iconH / 2, w, iconH);
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "left";
        ctx.font = "bold 20pt Arial";
        ctx.fillText(t(theme), x + 88, cy + 1);
    }

    private renderDifficulty(ctx: any, option: Option, difficulty: Difficulty): void {
        const { x, y, w } = option.rect;
        const color = DIFFICULTY_COLOR[difficulty];
        this.renderOptionFrame(ctx, option, color);

        const cx = x + w / 2;
        ctx.textAlign = "center";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 18pt Arial";
        ctx.fillText(t(difficulty), cx, y + 28);
        ctx.fillStyle = color;
        ctx.font = "bold 28pt Arial";
        ctx.fillText(formatMultiplier(DIFFICULTY_MULTIPLIER[difficulty]), cx, y + 64);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "12pt Arial";
        ctx.fillText(t((difficulty + "Info") as "easyInfo" | "mediumInfo" | "hardInfo"), cx, y + 98);
    }

    private renderDone(ctx: any, option: Option): void {
        const { x, y, w, h } = option.rect;
        gameUi.drawGlass(ctx, x, y, w, h, h / 2, "rgba(141,182,0,0.6)", "rgba(214,255,120,0.85)");
        ctx.textAlign = "center";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 20pt Arial";
        ctx.fillText("✓  " + t("back"), x + w / 2, y + h / 2 + 1);
    }

    // "#rrggbb" -> "rgba(r,g,b,a)"
    private withAlpha(hex: string, alpha: number): string {
        const value = parseInt(hex.slice(1), 16);
        return "rgba(" + ((value >> 16) & 255) + "," + ((value >> 8) & 255) + "," + (value & 255) + "," + alpha + ")";
    }
}
