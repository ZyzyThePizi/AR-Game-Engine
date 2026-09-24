import { GameType } from "../DataTypes/GameTypes";
import { Language } from "../state/settings";

export interface MenuElement{
    gameType: GameType
    color: string
    icon: string            // main picture on the card, e.g. "assets/server.svg"
    badge?: string          // optional small picture in the card's corner
    description: Record<Language, string>   // one short sentence per language shown on the card
}
