import { Menu } from "../app/menu/Menu";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";

// Global mutable state shared by the menu and every game: landmarks, whose turn it is
// (menu vs. game), and the active menu/score. Kept out of environment.ts so the
// production build (which swaps in environment.prod.ts) still has it available.
export const gameController = {
  isInMenu: false,
  isInGame: false,
  menuController: null as Menu | null,
  leftWrist: null as NormalizedLandmark | null,
  rightWrist: null as NormalizedLandmark | null,
  leftShoulder: null as NormalizedLandmark | null,
  rightShoulder: null as NormalizedLandmark | null,
  // hand points used by every game and menu (estimated along the forearm, see
  // AppComponent.handPoint); null while that hand is outside the camera frame
  leftPalm: null as NormalizedLandmark | null,
  rightPalm: null as NormalizedLandmark | null,
  score: 0,
  castleHealth: 0
};
