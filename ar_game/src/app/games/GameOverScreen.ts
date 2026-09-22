import { addLeaderboardEntry, LeaderboardEntry } from "../../utils/leaderboard";
import { drawPanel, returnToMenu } from "../../utils/gameUi";

export interface GameOverConfig {
    ctx: any,
    cvWidth: number,
    cvHeight: number,
    stats: string[],                        // result lines shown under "A játéknak vége!"
    score: number,                          // the value the leaderboard ranks by (higher is better)
    formatScore: (score: number) => string,
    leaderboardKey: string,                 // localStorage key, one per game
    leaderboardTitle: string
}

// End-of-game flow shared by every game: results panel -> operator types the player's name ->
// top-10 leaderboard with the current run highlighted -> back to the menu.
export class GameOverScreen {

    private readonly NAME_ENTRY_TIMEOUT_MS = 60000;
    private readonly LEADERBOARD_SHOW_MS = 7000;

    private config: GameOverConfig;
    private nameOverlay: HTMLDivElement | null = null;
    private nameEntryTimeout = null as NodeJS.Timeout | null;

    constructor(config: GameOverConfig) {
        this.config = config;
        const panel = this.showResults();
        this.showNameEntry(panel.y + panel.h - 55);
    }

    private showResults(): { y: number, h: number } {
        const { ctx, cvWidth, cvHeight, stats } = this.config;
        const w = 560;
        const h = 190 + stats.length * 46;
        const x = cvWidth / 2 - w / 2;
        const y = cvHeight / 2 - h / 2;

        ctx.clearRect(0, 0, cvWidth, cvHeight);
        drawPanel(ctx, x, y, w, h);

        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "bold 30pt Arial";
        ctx.fillText("A játéknak vége!", cvWidth / 2, y + 50);
        ctx.font = "bold 21pt Arial";
        stats.forEach((line, i) => ctx.fillText(line, cvWidth / 2, y + 110 + i * 46));
        return { y: y, h: h };
    }

    private showNameEntry(centerY: number): void {
        const overlay = document.createElement("div");
        // position in canvas pixels: the container can be wider than the canvas
        overlay.style.cssText = "position:absolute; left:" + (this.config.cvWidth / 2) + "px; top:" + centerY + "px;" +
            "transform:translate(-50%,-50%); display:flex; gap:8px; z-index:10;";

        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 20;
        input.placeholder = "Játékos neve";
        input.style.cssText = "font-size:18pt; padding:6px 10px; border-radius:8px; border:2px solid #fff; width:260px;";

        const button = document.createElement("button");
        button.innerText = "Mentés";
        button.style.cssText = "font-size:18pt; padding:6px 16px; border-radius:8px; border:none;" +
            "background:#8db600; color:#fff; font-weight:bold; cursor:pointer;";

        const submit = () => this.submitName(input.value);
        button.addEventListener("click", submit);
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") submit();
        });

        overlay.appendChild(input);
        overlay.appendChild(button);
        document.getElementById('container')?.appendChild(overlay);
        this.nameOverlay = overlay;
        input.focus();

        // never leave the station stuck if nobody types a name
        this.nameEntryTimeout = setTimeout(() => this.submitName(""), this.NAME_ENTRY_TIMEOUT_MS);
    }

    private submitName(rawName: string): void {
        if (!this.nameOverlay) return;
        clearTimeout(this.nameEntryTimeout as NodeJS.Timeout);
        this.nameOverlay.remove();
        this.nameOverlay = null;

        const entry: LeaderboardEntry = { name: rawName.trim() || "Névtelen", score: this.config.score, date: Date.now() };
        const entries = addLeaderboardEntry(this.config.leaderboardKey, entry);
        this.showLeaderboard(entries, entry);

        const { ctx, cvWidth, cvHeight } = this.config;
        setTimeout(() => returnToMenu(ctx, cvWidth, cvHeight), this.LEADERBOARD_SHOW_MS);
    }

    private showLeaderboard(entries: LeaderboardEntry[], current: LeaderboardEntry): void {
        const { ctx, cvWidth, cvHeight, formatScore } = this.config;
        const rowHeight = 36;
        const panelW = 600;
        const panelH = 150 + entries.length * rowHeight;
        const panelX = cvWidth / 2 - panelW / 2;
        const panelY = cvHeight / 2 - panelH / 2;

        ctx.clearRect(0, 0, cvWidth, cvHeight);
        drawPanel(ctx, panelX, panelY, panelW, panelH);

        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.font = "bold 24pt Arial";
        ctx.fillText(this.config.leaderboardTitle, cvWidth / 2, panelY + 40);

        const firstRowY = panelY + 95;
        const isCurrent = (entry: LeaderboardEntry) => entry.date === current.date && entry.name === current.name;
        entries.forEach((entry, index) => {
            const y = firstRowY + index * rowHeight;
            if (isCurrent(entry)) {
                ctx.beginPath();
                ctx.roundRect(panelX + 20, y - rowHeight / 2 + 2, panelW - 40, rowHeight - 4, [8]);
                ctx.fillStyle = "rgba(141,182,0,0.95)";
                ctx.fill();
            }
            ctx.fillStyle = "#FFFFFF";
            ctx.font = (isCurrent(entry) ? "bold " : "") + "18pt Arial";
            ctx.textAlign = "left";
            ctx.fillText((index + 1) + ". " + entry.name, panelX + 40, y);
            ctx.textAlign = "right";
            ctx.fillText(formatScore(entry.score), panelX + panelW - 40, y);
        });

        if (!entries.some(isCurrent)) {
            ctx.textAlign = "center";
            ctx.font = "bold 16pt Arial";
            ctx.fillText("A te eredményed: " + formatScore(current.score), cvWidth / 2, panelY + panelH - 20);
        }
    }
}
