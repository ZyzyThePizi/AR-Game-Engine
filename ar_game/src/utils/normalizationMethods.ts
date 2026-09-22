import {ObjectCoordinates} from "../interfaces/ObjectCoordinates";
import {NormalizedLandmark} from "@mediapipe/tasks-vision";
import { gameController } from "../state/gameController";

export function getCenterNormalized(menuHeight: number, squareHeight: number, squareWidth: number, cvWidth: number,
                                    cvHeight: number, centerX: number ): ObjectCoordinates{
    const centerY = (menuHeight - squareHeight) / 2;

    const min = {
        x: centerX / cvWidth,
        y: centerY / cvHeight
    };

    const max = {
        x: (centerX + squareWidth) / cvWidth,
        y: (centerY + squareHeight) / cvHeight
    };

    const center = {
        x: (centerX + squareWidth / 2) / cvWidth,
        y: (centerY + squareHeight / 2) / cvHeight
    };

    return {
        min: min,
        max: max,
        center: center
    };

}

export function getNormalizedCircle(center_x: number, center_y: number, radius: number, cvWidth: number,
                                    cvHeight: number): ObjectCoordinates {
    const min = {
        x: (center_x - radius) / cvWidth,
        y: (center_y - radius) / cvHeight
    };

    const max = {
        x: (center_x + radius) / cvWidth,
        y: (center_y + radius) / cvHeight
    };

    const center = {
        x: center_x / cvWidth,
        y: center_y / cvHeight
    };

    return {
        min: min,
        max: max,
        center: center
    };

}

export function getNormalizedCircleMenu(menuHeight: number ,center_x: number, center_y: number, radius: number,
                                    squareHeight: number, cvWidth: number, cvHeight: number,): ObjectCoordinates {
    const centerY = (menuHeight - squareHeight) / 2;

    const min = {
        x: (center_x - radius) / cvWidth,
        y: (center_y - radius) / cvHeight
    };

    const max = {
        x: (center_x + radius) / cvWidth,
        y: (center_y + radius) / cvHeight
    };

    const center = {
        x: center_x / cvWidth,
        y: centerY / cvHeight
    };

    return {
        min: min,
        max: max,
        center: center
    };

}

// Box around both shoulders (mirrored like the canvas), padded 0.05 vertically.
// Works on copies: the shared landmarks must not be flipped in place.
export function getNormalizedShoulders(): ObjectCoordinates {
    const left = gameController.leftShoulder as NormalizedLandmark;
    const right = gameController.rightShoulder as NormalizedLandmark;
    const leftX = (left.x * -1) + 1;
    const rightX = (right.x * -1) + 1;

    const min = {
        x: Math.min(leftX, rightX),
        y: Math.min(left.y, right.y) - 0.05
    };

    const max = {
        x: Math.max(leftX, rightX),
        y: Math.max(left.y, right.y) + 0.05
    };

    const center = {
        x: (min.x + max.x) / 2,
        y: (min.y + max.y) / 2
    };

    return {
        min: min,
        max: max,
        center: center
    };
}

export function getNormalizedHandCircle(centerX: number, centerY: number, radius: number): ObjectCoordinates {
    const min = {
        x: centerX - radius,
        y: centerY - radius
    };

    const max = {
        x: centerX + radius,
        y: centerY + radius
    };

    const center = {
        x: centerX,
        y: centerY
    };

    return {
        min: min,
        max: max,
        center: center
    };
}