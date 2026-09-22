export interface LeaderboardEntry {
    name: string,
    score: number,
    date: number
}

const MAX_ENTRIES = 10;

export function loadLeaderboard(key: string): LeaderboardEntry[] {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        // older Patch the Server entries stored the result as "seconds"
        return parsed
            .map((entry: any) => ({
                name: String(entry.name),
                score: typeof entry.score === "number" ? entry.score : entry.seconds,
                date: entry.date
            }))
            .filter(entry => typeof entry.score === "number");
    } catch {
        return [];
    }
}

// Saves the entry and returns the updated top list (highest score first).
export function addLeaderboardEntry(key: string, entry: LeaderboardEntry): LeaderboardEntry[] {
    const entries = [...loadLeaderboard(key), entry]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    try {
        localStorage.setItem(key, JSON.stringify(entries));
    } catch {
        // storage unavailable: the list still shows for this game
    }
    return entries;
}
