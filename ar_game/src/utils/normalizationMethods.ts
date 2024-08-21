import {ObjectCoordinates} from "../interfaces/ObjectCoordinates";
import {NormalizedLandmark} from "@mediapipe/tasks-vision";
import {gameController} from "../environments/environment";

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

export function getNormalizedShoulders(): ObjectCoordinates {
    let minBase = gameController.leftShoulder as NormalizedLandmark;
    let maxBase = gameController.rightShoulder as NormalizedLandmark;

    minBase.x = (minBase.x * -1) + 1;
    maxBase.x = (maxBase.x * -1) + 1;

    const min = {
        x: minBase.x,
        y: minBase.y - 0.05
    };

    const max = {
        x: maxBase.x,
        y: maxBase.y + 0.05
    };

    const center = {
        x: (maxBase.x - minBase.x) / 2,
        y: (maxBase.y - minBase.y) / 2
    };

    return {
        min: min,
        max: max,
        center: center
    };
}

export function getNormalizedWristCircle(centerX: number, centerY: number, radius: number): ObjectCoordinates {
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