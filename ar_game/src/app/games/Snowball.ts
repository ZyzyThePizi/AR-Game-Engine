import { ObjectCoordinates } from "src/interfaces/ObjectCoordinates";
import { Sphere } from "./Sphere";
import * as normalizationUtils from "../../utils/normalizationMethods";

export class Snowball {
    private x: number;
    private y: number;
    private speedX: number;
    private speedY: number;
    private radius: number;
    private cvWidth: number
    private cvHeight: number
    private ctx: any;
    private image: HTMLImageElement;

    constructor(cvWidth: number, cvHeight: number, ctx: any, imageUrl: string) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.x = Math.random() * cvWidth;
        this.y = Math.random() * cvHeight;
        this.speedX = (Math.random() - 0.5) * 2;
        this.speedY = (Math.random() - 0.5) * 2;
        this.radius = 25;
        this.ctx = ctx;
        this.image = new Image();
        this.image.src = imageUrl
    }

    setPosition(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.draw();
    }

    draw() {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.clip();
        this.ctx.drawImage(this.image, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        this.ctx.restore();
    }

    getCoordinates() {
        return {
            x: this.x,
            y: this.y,
            radius: this.radius
        };
    }

    getNormalizedSphere(): ObjectCoordinates {
        return normalizationUtils.getNormalizedCircle(this.x, this.y, this.radius, this.cvWidth, this.cvHeight);
    }

    setSpeed(speedX: number, speedY: number) {
        this.speedX = speedX;
        this.speedY = speedY;
    }
}