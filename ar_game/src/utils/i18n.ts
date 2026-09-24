import { settings } from "../state/settings";

// All on-screen text in both languages. Game names (GameType values) are never translated.
// "{name}" placeholders are filled from the params passed to t().
const TEXTS = {
    // sidebar
    enableWebcam: { hu: "KAMERA BE", en: "ENABLE WEBCAM" },
    disableWebcam: { hu: "KAMERA KI", en: "DISABLE WEBCAM" },
    showJoints: { hu: "Ízületek mutatása", en: "Show joints" },
    hideJoints: { hu: "Ízületek elrejtése", en: "Hide joints" },
    fullscreen: { hu: "Teljes képernyő", en: "Fullscreen" },
    exitFullscreen: { hu: "Kilépés a teljes képernyőből", en: "Exit fullscreen" },

    // menu
    chooseGame: { hu: "Válassz játékot!", en: "Choose a game!" },
    start: { hu: "▶  INDÍTÁS", en: "▶  START" },
    holdYourHand: { hu: "Tartsd rajta a kezed!", en: "Hold your hand on it!" },
    almostThere: { hu: "Még egy kicsit...", en: "Almost there..." },
    hintSwipe: { hu: "⇆  Lapozás: húzd el a kezed oldalra, vagy tartsd egy szélső kártyán",
                 en: "⇆  Browse: swipe your hand sideways, or hold it on a side card" },
    hintStart: { hu: "✋  Indítás: tartsd a kezed a zöld gombon", en: "✋  Start: hold your hand on the green button" },
    hintSettings: { hu: "⚙  Beállítások: tartsd a kezed a jobb felső gombon",
                    en: "⚙  Settings: hold your hand on the top-right button" },

    // settings
    settings: { hu: "Beállítások", en: "Settings" },
    language: { hu: "Nyelv", en: "Language" },
    difficulty: { hu: "Nehézség", en: "Difficulty" },
    back: { hu: "Kész", en: "Done" },
    easy: { hu: "Könnyű", en: "Easy" },
    medium: { hu: "Közepes", en: "Medium" },
    hard: { hu: "Nehéz", en: "Hard" },
    easyInfo: { hu: "Lassabb tempó", en: "Slower pace" },
    mediumInfo: { hu: "Az eredeti élmény", en: "The original" },
    hardInfo: { hu: "Gyorsabb, több pont", en: "Faster, more points" },
    points: { hu: "pont", en: "pts" },
    multiplierInfo: { hu: "A pontszámot a szorzóval számoljuk.", en: "Scores are multiplied by the multiplier." },

    // shared game UI
    getReady: { hu: "Készülj!", en: "Get ready!" },
    difficultyLine: { hu: "Nehézség: {level} · {mult} pont", en: "Difficulty: {level} · {mult} points" },
    time: { hu: "IDŐ", en: "TIME" },
    health: { hu: "ÉLET", en: "HEALTH" },
    blocked: { hu: "KIVÉDVE", en: "BLOCKED" },
    score: { hu: "PONTOK", en: "POINTS" },
    caught: { hu: "ELKAPVA", en: "CAUGHT" },
    speed: { hu: "SEBESSÉG", en: "SPEED" },
    survival: { hu: "TÚLÉLÉSI IDŐ", en: "SURVIVAL" },
    down: { hu: "KIESETT", en: "DOWN" },
    patched: { hu: "JAVÍTVA", en: "PATCHED" },
    lifeLost: { hu: "-{n} élet", en: "-{n} life" },
    serverDown: { hu: "Kiesett!", en: "Down!" },
    serverPatched: { hu: "Javítva!", en: "Patched!" },
    timeBonus: { hu: "+{n} mp", en: "+{n} s" },
    lifeGained: { hu: "+{n} élet", en: "+{n} health" },
    freezeText: { hu: "FAGYASZTÁS!", en: "FREEZE!" },
    frozen: { hu: "FAGYASZTVA", en: "FROZEN" },
    hotfixText: { hu: "HOTFIX! +1 szerver", en: "HOTFIX! +1 server" },

    // results per game
    gameOver: { hu: "A játéknak vége!", en: "Game over!" },
    healthLeft: { hu: "Megmaradt élet", en: "Health left" },
    attacksBlocked: { hu: "Kivédett támadás", en: "Attacks blocked" },
    packagesCaught: { hu: "Elkapott csomag", en: "Packages caught" },
    virusHits: { hu: "Vírustalálat", en: "Virus hits" },
    survivalTime: { hu: "Túlélési idő", en: "Survival time" },
    serversPatched: { hu: "Javított szerver", en: "Servers patched" },
    finalScore: { hu: "Pontszám", en: "Score" },

    // name entry and leaderboard
    enterName: { hu: "Írd be a neved!", en: "Enter your name!" },
    namePlaceholder: { hu: "NEVED", en: "YOUR NAME" },
    anonymous: { hu: "NÉVTELEN", en: "ANONYMOUS" },
    keySpace: { hu: "SZÓKÖZ", en: "SPACE" },
    keyDone: { hu: "✓ KÉSZ", en: "✓ DONE" },
    keyboardHint: { hu: "Tartsd a kezed egy betűn a beíráshoz", en: "Hold your hand on a key to type it" },
    leaderboard: { hu: "Ranglista", en: "Leaderboard" },
    yourRank: { hu: "Helyezésed: {rank}.", en: "Your rank: #{rank}" },
    notInTop: { hu: "Az eredményed: {score} – most nem fért be a legjobb 10-be", en: "Your score: {score} – not in the top 10 this time" },
    newRecord: { hu: "ÚJ REKORD!", en: "NEW RECORD!" },
    continue: { hu: "Tovább ▶", en: "Continue ▶" },
    emptyBoard: { hu: "Még nincs eredmény", en: "No scores yet" }
};

export type TextKey = keyof typeof TEXTS;

export function t(key: TextKey, params?: Record<string, string | number>): string {
    let text = TEXTS[key][settings.language];
    if (params) {
        Object.keys(params).forEach(name => text = text.replace("{" + name + "}", String(params[name])));
    }
    return text;
}

// "×1,5" in Hungarian (decimal comma), "×1.5" in English
export function formatMultiplier(multiplier: number): string {
    const value = String(multiplier);
    return "×" + (settings.language === 'hu' ? value.replace(".", ",") : value);
}
