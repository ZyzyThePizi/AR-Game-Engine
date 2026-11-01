// Player-facing settings chosen in the menu's settings panel, remembered in localStorage.
// Games read them once when they start, so a change never alters a game already running.

export type Language = 'hu' | 'en';
export type Difficulty = 'easy' | 'medium' | 'hard';
// look of the whole app: the original IT look, or Mikulás / St. Nicholas Day, 6 December
// (snow, gifts, a snowman, boots to clean)
export type Theme = 'classic' | 'mikulas';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
export const LANGUAGES: Language[] = ['hu', 'en'];
export const THEMES: Theme[] = ['classic', 'mikulas'];

// score multiplier per difficulty; medium keeps the original scoring
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = { easy: 0.5, medium: 1, hard: 1.5 };

export const DIFFICULTY_COLOR: Record<Difficulty, string> = { easy: "#22c55e", medium: "#3b82f6", hard: "#ef4444" };

const STORAGE_KEY = "arGameSettings";

export const settings = {
    language: 'hu' as Language,
    difficulty: 'medium' as Difficulty,
    theme: 'classic' as Theme
};

const listeners: (() => void)[] = [];

(function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        if (LANGUAGES.includes(saved.language)) settings.language = saved.language;
        if (DIFFICULTIES.includes(saved.difficulty)) settings.difficulty = saved.difficulty;
        if (THEMES.includes(saved.theme)) settings.theme = saved.theme;
    } catch {
        // storage unavailable or corrupt: keep the defaults
    }
})();

function save(): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // storage unavailable: the setting still applies until reload
    }
    listeners.forEach(listener => listener());
}

export function setLanguage(language: Language): void {
    if (settings.language === language) return;
    settings.language = language;
    save();
}

export function setDifficulty(difficulty: Difficulty): void {
    if (settings.difficulty === difficulty) return;
    settings.difficulty = difficulty;
    save();
}

export function setTheme(theme: Theme): void {
    if (settings.theme === theme) return;
    settings.theme = theme;
    save();
}

export function onSettingsChange(listener: () => void): void {
    listeners.push(listener);
}

// Picks the tuning value for the current difficulty, e.g. byDifficulty({ easy: 50, medium: 70, hard: 95 })
export function byDifficulty<T>(values: Record<Difficulty, T>): T {
    return values[settings.difficulty];
}

// Picks the asset or value for the current theme, e.g. byTheme({ classic: "assets/server.svg", mikulas: "assets/mikulas/snowman.svg" })
export function byTheme<T>(values: Record<Theme, T>): T {
    return values[settings.theme];
}

export function isMikulas(): boolean {
    return settings.theme === 'mikulas';
}

export function scoreMultiplier(difficulty: Difficulty = settings.difficulty): number {
    return DIFFICULTY_MULTIPLIER[difficulty];
}
