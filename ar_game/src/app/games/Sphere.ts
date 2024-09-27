import {ObjectCoordinates} from "../../interfaces/ObjectCoordinates";
import * as normalizationUtils from "../../utils/normalizationMethods";

export class Sphere {

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;

    private radius = 30;
    private speed: number;

    private current_y = -this.radius;
    private current_x: number;

    private animationNumber: any = null;
    private image: HTMLImageElement;

    constructor(cvWidth: number, cvHeight: number, isFriendly: boolean ,ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;

        this.current_x = this.getRandomInt(30, this.cvWidth - 30);
        this.speed = isFriendly ? 2 : 1,7 ;

        this.image = new Image();
        this.image.src = isFriendly ? 'assets/friendlyPackage.svg' : 'assets/nonFriendlyVirus.svg';

        this.startSphere();
    }


    startSphere() {
        this.animationNumber = requestAnimationFrame(() => {
            this.updateSphere();
        })
    }

    drawSphere() {
        this.ctx.drawImage(this.image, this.current_x - this.radius, this.current_y - this.radius, this.radius * 2, this.radius * 2);
    }

    stopSphere() {
        if (this.animationNumber !== null) {
            cancelAnimationFrame(this.animationNumber);
        }
    }

    updateSphere() {
        this.ctx.clearRect(this.current_x - this.radius-1, this.current_y - this.radius-1, 62, 62);
        this.current_y += this.speed;
        this.drawSphere();

        if (this.current_y - this.radius >= this.cvHeight) {
            this.current_y = -this.radius;
            this.current_x = this.getRandomInt(30, this.cvWidth - 30);
        }

        this.animationNumber = requestAnimationFrame(() => {
            this.updateSphere();
        });
    }

    resetSphere() {
        this.ctx.clearRect(this.current_x - this.radius-1, this.current_y - this.radius-1, 62, 62);
        this.current_y = -this.radius;
        this.current_x = this.getRandomInt(30, this.cvWidth - 30);
    }

    getRandomInt(min: number, max: number) {
        const minCeiled = Math.ceil(min);
        const maxFloored = Math.floor(max);
        return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled);
    }

    getNormalizedSphere(): ObjectCoordinates {
        return normalizationUtils.getNormalizedCircle(this.current_x, this.current_y, this.radius, this.cvWidth, this.cvHeight)
    }

}