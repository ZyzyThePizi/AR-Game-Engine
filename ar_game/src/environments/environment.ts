import {Menu} from "../app/menu/Menu";
import {NormalizedLandmark} from "@mediapipe/tasks-vision";

export const environment = {
  production: false
};

export const gameController = {
  isInMenu: false,
  isInGame: false,
  menuController: null as Menu | null,
  leftWrist: null as NormalizedLandmark | null,
  rightWrist: null as NormalizedLandmark | null,
  leftShoulder: null as NormalizedLandmark | null,
  rightShoulder: null as NormalizedLandmark | null,
  score: 0
};