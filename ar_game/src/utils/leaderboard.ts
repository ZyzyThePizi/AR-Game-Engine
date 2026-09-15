export interface LeaderboardEntry {
    name: string,
    seconds: number,
    date: number
}

const MAX_ENTRIES = 10;

export function loadLeaderboard(key: string): LeaderboardEntry[] {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// Saves the entry and returns the updated top list (sorted by longest survival first).
export function addLeaderboardEntry(key: string, entry: LeaderboardEntry): LeaderboardEntry[] {
    const entries = [...loadLeaderboard(key), entry]
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, MAX_ENTRIES);
    try {
        localStorage.setItem(key, JSON.stringify(entries));
    } catch {
        // storage unavailable: the list still shows for this game
    }
    return entries;
}
