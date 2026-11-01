import { isMikulas } from "../state/settings";

export enum GameType {
    SaveTheServer = "Save the Server",
    FilterTheTraffic = "Filter the Traffic",
    PatchTheServer = "Patch the Server"
}

// The games' names in the Mikulás theme (like the GameType values, never translated)
const MIKULAS_NAMES: Record<GameType, string> = {
    [GameType.SaveTheServer]: "Save the Snowman",
    [GameType.FilterTheTraffic]: "Catch the Gifts",
    [GameType.PatchTheServer]: "Shine the Boots"
};

// The name shown on screen (menu card, results, leaderboard) for the current theme
export function gameName(gameType: GameType): string {
    return isMikulas() ? MIKULAS_NAMES[gameType] : gameType;
}
