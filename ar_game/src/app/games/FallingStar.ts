import {gameController} from "../../environments/environment";
import {ObjectCoordinates} from "../../interfaces/ObjectCoordinates";
import {Sphere} from "./Sphere";
import * as normalizationUtils from "../../utils/normalizationMethods";

export class FallingStar {

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private timerCanvas: HTMLCanvasElement;
    private timerCtx: any;
    private intervalId = null as NodeJS.Timeout | null;
    private timerInterval = null as NodeJS.Timeout | null;
    private detectCollison = null as number | null;
    private sphereFriendly: any = null;
    private sphereNonFriendly: any = null;

    constructor(cvWidth: number, cvHeight: number, ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;

        this.timerCanvas = document.createElement("canvas");
        this.timerCanvas.width = this.cvWidth;
        this.timerCanvas.height = this.cvHeight * 0.15;
        this.timerCanvas.style.position = "absolute";
        this.timerCanvas.style.top = "0";
        this.timerCanvas.style.left = "0";
        document.getElementById('container')?.appendChild(this.timerCanvas);

        // Timer canvas context
        this.timerCtx = this.timerCanvas.getContext("2d")!;

        this.initGame();
    }

    initGame(){
        this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight);
        gameController.score = 0;
        this.drawGame();
        this.checkCollison();
    }

    checkCollison() {
        if (!gameController.leftWrist || !gameController.rightWrist
            || !gameController.leftShoulder || !gameController.rightShoulder ) return;

        let friendly = this.sphereFriendly.getNormalizedSphere();

        let shoulder = normalizationUtils.getNormalizedShoulders();

        const wristRadius = 0.05;
        let leftWristCircle = normalizationUtils.getNormalizedWristCircle(
            (gameController.leftWrist.x * -1) + 1,
            gameController.leftWrist.y,
            wristRadius
        );

        let rightWristCircle = normalizationUtils.getNormalizedWristCircle(
            (gameController.rightWrist.x * -1) + 1,
            gameController.rightWrist.y,
            wristRadius
        );

        let isInSphereFriendly = this.isCircleOverlap(friendly, leftWristCircle)
            || this.isCircleOverlap(friendly, rightWristCircle);

        if (isInSphereFriendly) {
            gameController.score += 100;
            this.setScoreBoard();
            this.sphereFriendly.resetSphere();
        }

        if(this.sphereNonFriendly != null) {
            let nonFriendly = this.sphereNonFriendly.getNormalizedSphere();

            let isInShoulderCollision = this.isCircleOverlapWithRectangle(nonFriendly, shoulder);

            if (isInShoulderCollision) {
                gameController.score -= 200;
                this.setScoreBoard();
                this.sphereNonFriendly.resetSphere();
            }
        }

        this.detectCollison = requestAnimationFrame(() => {
            this.checkCollison();
        });
    }

    startTimer(){
        let timer = 60;
        this.timerInterval = setInterval(() => {
            this.timerCtx.clearRect(this.cvWidth / 2 - 75, 0, 150, this.timerCanvas.height);
            this.timerCtx.beginPath();
            this.timerCtx.roundRect(this.cvWidth / 2 - 75, this.timerCanvas.height / 2 - 50, 150, 100, [10]);
            this.timerCtx.fillStyle = "rgba(168,162,162,0.15)";
            this.timerCtx.fill();
            this.timerCtx.closePath();

            this.timerCtx.fillStyle = "#FFFFFF";
            this.timerCtx.font = "bold 20pt Arial";
            this.timerCtx.textAlign = "center";
            this.timerCtx.textBaseline = "middle";
            --timer;
            this.timerCtx.fillText(timer, this.cvWidth / 2, this.timerCanvas.height / 2);

            if (timer == 0) {
                clearInterval(this.timerInterval as NodeJS.Timeout);
                this.exitGame()
            }
        },1000)

    }

    exitGame(x: number = 0) {
        if (x != 0) {
            if(!gameController.leftWrist) return;

            const normalizedCircle = normalizationUtils.getNormalizedCircle(50,
                this.cvHeight - 50, 40, this.cvWidth, this.cvHeight)

            const isInElement = ((x <= normalizedCircle.max.x && x >= normalizedCircle.min.x)
                && (gameController.leftWrist.y <= normalizedCircle.max.y && gameController.leftWrist.y >= normalizedCircle.min.y));

            if (!isInElement) return;
        }

        this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight);
        this.timerCtx.clearRect(0, 0, this.timerCanvas.width, this.timerCanvas.height);
        clearInterval(this.intervalId as NodeJS.Timeout);
        clearInterval(this.timerInterval as NodeJS.Timeout);
        cancelAnimationFrame(this.detectCollison as number);
        this.sphereFriendly.stopSphere();
        this.sphereNonFriendly.stopSphere();
        this.showGameResults();
        setTimeout(()=> {
            this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight)
            if(!gameController.menuController) return;
            gameController.isInGame = false;
            gameController.menuController?.drawMenu();
            // garbage collector
            gameController.menuController.game = null;
            this.sphereFriendly = null;
            this.sphereNonFriendly = null;
        },5000)
    }

    isCircleOverlap(circle1: ObjectCoordinates, circle2: ObjectCoordinates): boolean {
        const dx = circle1.center.x - circle2.center.x;
        const dy = circle1.center.y - circle2.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const radiusSum = (circle1.max.x - circle1.center.x) + (circle2.max.x - circle2.center.x);
        return distance < radiusSum;
    }

    isCircleOverlapWithRectangle(circle: ObjectCoordinates, rect: ObjectCoordinates): boolean {
        const circleCenterX = circle.center.x;
        const circleCenterY = circle.center.y;
        const circleRadius = circle.max.x - circle.center.x;

        if (circleCenterX > rect.min.x && circleCenterX < rect.max.x &&
            circleCenterY > rect.min.y && circleCenterY < rect.max.y) {
            return true;
        }

        const closestX = Math.max(rect.min.x, Math.min(circleCenterX, rect.max.x));
        const closestY = Math.max(rect.min.y, Math.min(circleCenterY, rect.max.y));

        const dx = circleCenterX - closestX;
        const dy = circleCenterY - closestY;

        return (dx * dx + dy * dy) < (circleRadius * circleRadius);
    }

    showGameResults() {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.ctx.beginPath();
        this.ctx.roundRect(this.cvWidth / 2 - 225, this.cvHeight / 2 - 150 , 450, 300, [15]);
        this.ctx.fillStyle = "rgba(255,99,0,0.65)";
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 25pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("Megszerzett pontok: " + gameController.score, this.cvWidth / 2, this.cvHeight / 2);
    }

    setScoreBoard(): void {
        this.timerCtx.clearRect(this.cvWidth - 100, 0, 100, 100);
        this.timerCtx.beginPath();
        this.timerCtx.roundRect(this.cvWidth - 100, this.timerCanvas.height / 2 - 50, 100, 100, [15]);
        this.timerCtx.fillStyle = "rgba(255,234,0,0.09)";
        this.timerCtx.fill();
        this.timerCtx.closePath();

        this.timerCtx.fillStyle = "#FFFFFF";
        this.timerCtx.font = "bold 10pt Arial";
        this.timerCtx.textAlign = "center";
        this.timerCtx.textBaseline = "middle";
        this.timerCtx.fillText("Pontok: " + gameController.score, this.cvWidth - 50, this.timerCanvas.height / 2);
    }

    drawGame(): void {
        this.startTimer();
        this.sphereFriendly = new Sphere(this.cvWidth, this.cvHeight, true, this.ctx);
        setTimeout(() => {
            this.sphereNonFriendly = new Sphere(this.cvWidth, this.cvHeight, false, this.ctx);
        }, 200)
        this.setScoreBoard();
    }

}