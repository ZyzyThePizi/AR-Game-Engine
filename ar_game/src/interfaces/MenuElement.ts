import { GameType } from "../DataTypes/GameTypes";
import { Language } from "../state/settings";

// What a menu card shows
export interface MenuCardArt {
    color: string
    icon: string            // main picture on the card, e.g. "assets/server.svg"
    badge?: string          // optional small picture in the card's corner
    description: Record<Language, string>   // one short sentence per language shown on the card
}

export interface MenuElement extends MenuCardArt {
    gameType: GameType
    mikulas?: MenuCardArt     // the card in the Mikulás theme (its name comes from gameName())
}
