import { GameType } from "../DataTypes/GameTypes";

export interface MenuElement{
    gameType: GameType
    color: string
    icon: string            // main picture on the card, e.g. "assets/server.svg"
    badge?: string          // optional small picture in the card's corner
    description: string     // one short Hungarian sentence shown on the card
}
