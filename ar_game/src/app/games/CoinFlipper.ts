import {gameController} from "../../environments/environment";
import {GameType} from "../../DataTypes/GameTypes";
import {ObjectCoordinates} from "../../interfaces/ObjectCoordinates";

export class CoinFlipper {

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private currentx = 0;
    private isEscInAction = false;
    private intervalId = null as NodeJS.Timeout | null;

    constructor(cvWidth: number, cvHeight: number, ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;

        this.initGame();
    }

    initGame(){
        this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight);
        this.drawGame();
        gameController.menuController?.drawEscape();
        this.checkExit();
    }

    drawGame(){
        this.ctx.beginPath();
        this.ctx.roundRect(this.cvWidth / 2 - 125, this.cvHeight / 4 - 50, 250, 100,[10]);
        this.ctx.fillStyle = '#e78b04';
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 20pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText( GameType.CoinCollector, this.cvWidth / 2, this.cvHeight / 4)
    }

    checkExit() {

        const normalizedCircle = this.getNormalizedCircle(50, this.cvHeight - 50, 40);
        console.log(gameController)
        this.intervalId = setInterval(()=> {
            if(!gameController.leftWrist) return;
            this.currentx = (gameController.leftWrist.x * -1) + 1;

            const isInElement = (((gameController.leftWrist.x * -1) + 1) <= normalizedCircle.max.x
                    && ((gameController.leftWrist.x * -1) + 1) >= normalizedCircle.min.x)
                && (gameController.leftWrist.y <= normalizedCircle.max.y && gameController.leftWrist.y >= normalizedCircle.min.y);

            console.log(this.currentx);
            console.log(normalizedCircle)


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

    exitGame(x: number) {
        if(!gameController.leftWrist) return;
        if(!gameController.menuController) return;

        const normalizedCircle = this.getNormalizedCircle(50, this.cvHeight - 50, 40)

        const isInElement = ((x <= normalizedCircle.max.x && x >= normalizedCircle.min.x)
            && (gameController.leftWrist.y <= normalizedCircle.max.y && gameController.leftWrist.y >= normalizedCircle.min.y));

        if (!isInElement) return;

        this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight);
        clearInterval(this.intervalId as NodeJS.Timeout);
        gameController.isInGame = false;
        gameController.menuController?.drawMenu();
        // garbage collector
        gameController.menuController.game = null;
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

}