import {gameController} from "../../environments/environment";
import {GameType} from "../../DataTypes/GameTypes";
import {ObjectCoordinates} from "../../interfaces/ObjectCoordinates";
import {Sphere} from "./Sphere";

export class FallingStar {

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private timerCanvas: HTMLCanvasElement;
    private timerCtx: any;
    private currentx = 0;
    private isEscInAction = false;
    private intervalId = null as NodeJS.Timeout | null;
    private timerInterval = null as NodeJS.Timeout | null;
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
        this.drawGame();
        this.checkExit();
    }

    startTimer(){
        let timer = 30;
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

    checkExit() {

        const normalizedCircle = this.getNormalizedCircle(50, this.cvHeight - 50, 40);
        this.intervalId = setInterval(()=> {
            if(!gameController.leftWrist) return;
            this.currentx = (gameController.leftWrist.x * -1) + 1;

            const isInElement = (this.currentx <= normalizedCircle.max.x
                    && this.currentx >= normalizedCircle.min.x)
                && (gameController.leftWrist.y <= normalizedCircle.max.y && gameController.leftWrist.y >= normalizedCircle.min.y);

            if (!isInElement || this.isEscInAction) return;
            else {
                this.isEscInAction = true;
                setTimeout(()=> {
                    this.exitGame(this.currentx);
                    this.isEscInAction = false;
                }, 1500);
            }
        }, 10);
    }

    exitGame(x: number = 0) {
        if(!gameController.menuController) return;
        if (x != 0) {
            if(!gameController.leftWrist) return;

            const normalizedCircle = this.getNormalizedCircle(50, this.cvHeight - 50, 40)

            const isInElement = ((x <= normalizedCircle.max.x && x >= normalizedCircle.min.x)
                && (gameController.leftWrist.y <= normalizedCircle.max.y && gameController.leftWrist.y >= normalizedCircle.min.y));

            if (!isInElement) return;
        }

        this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight);
        this.timerCtx.clearRect(0, 0, this.timerCanvas.width, this.timerCanvas.height);
        clearInterval(this.intervalId as NodeJS.Timeout);
        clearInterval(this.timerInterval as NodeJS.Timeout);
        gameController.isInGame = false;
        gameController.menuController?.drawMenu();
        this.sphereFriendly.stopSphere();
        this.sphereNonFriendly.stopSphere();
        // garbage collector
        gameController.menuController.game = null;
        this.sphereFriendly = null;
        this.sphereNonFriendly = null;
    }

    getNormalizedCircle(center_x: number, center_y: number, radius: number): ObjectCoordinates {
        const min = {
            x: (center_x - radius) / this.cvWidth,
            y: (center_y - radius) / this.cvHeight
        };

        const max = {
            x: (center_x + radius) / this.cvWidth,
            y: (center_y + radius) / this.cvHeight
        };

        const center = {
            x: center_x / this.cvWidth,
            y: center_y / this.cvHeight
        };

        return {
            min: min,
            max: max,
            center: center
        };

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
        this.timerCtx.fillText("Score: " + gameController.score, this.cvWidth - 50, this.timerCanvas.height / 2);
    }

    drawGame(): void {
        gameController.menuController?.drawEscape();
        this.startTimer();
        this.sphereFriendly = new Sphere(this.cvWidth, this.cvHeight, true, this.ctx);
        setTimeout(() => {
            this.sphereNonFriendly = new Sphere(this.cvWidth, this.cvHeight, false, this.ctx);
        }, 200)
        this.setScoreBoard();
    }

}