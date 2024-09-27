import { gameController } from "src/environments/environment";
import { ObjectCoordinates } from "src/interfaces/ObjectCoordinates";
import { Snowball } from "./Snowball";
import * as normalizationUtils from "../../utils/normalizationMethods";
import { timer } from "rxjs";

export class SaveTheServer {
    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;
    private timerCanvas: HTMLCanvasElement;
    private timerCtx: any;
    private intervalId = null as NodeJS.Timeout | null;
    private timerInterval = null as NodeJS.Timeout | null;
    private detectCollison = null as number | null;
    private snowballs: Snowball[] = [];
    private castleHealth: number = 10;
    private serverImage: HTMLImageElement;
    private castleX : number;
    private castleY: number;
    private castleWidth: number = 250;
    private castleHeight: number = 350;
    private castleLeft: number;
    private castleRight: number;
    private castleTop: number;
    private castleBottom: number;

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
        this.serverImage = new Image();
        this.serverImage.src = 'assets/server.svg'
        this.timerCtx = this.timerCanvas.getContext("2d")!;

        this.castleX = this.cvWidth/2;
        this.castleY = this.cvHeight;
        this.castleLeft = this.castleX - this.castleWidth / 2;
        this.castleRight = this.castleX + this.castleWidth / 2;
        this.castleTop = this.castleY - this.castleHeight;
        this.castleBottom = this.castleY;
        
        this.initGame();
    }

    private initGame(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        gameController.score = 0;
        gameController.castleHealth = this.castleHealth;
        this.drawGame();
        this.checkCollison();
    }

    private checkCollison(): void {
        if (!this.snowballs.length) return;
        if (!gameController.leftPalm || !gameController.rightPalm) return;

        const handRadius = 0.05;
        let leftPalmCircle = normalizationUtils.getNormalizedHandCircle(
            (gameController.leftPalm.x * -1) + 1,
            gameController.leftPalm.y,
            handRadius
        );

        let rightPalmCircle = normalizationUtils.getNormalizedHandCircle(
            (gameController.rightPalm.x * -1) + 1,
            gameController.rightPalm.y,
            handRadius
        );

        this.snowballs.forEach((snowball, index) => {
            const snowballCoordinates = snowball.getNormalizedSphere();

            let isinSnowball = this.isSnowballOverlap(snowballCoordinates, leftPalmCircle)
            || this.isSnowballOverlap(snowballCoordinates, rightPalmCircle);

            if (isinSnowball) {
                gameController.score += 1;
                this.snowballs.splice(index, 1);
                this.setScoreBoard();
            }
    

        });

        this.detectCollison = requestAnimationFrame(() =>
            this.checkCollison());        
    }

    private isSnowballOverlap(snowball: ObjectCoordinates, PalmCircle: ObjectCoordinates): boolean {
        const dx = snowball.center.x - PalmCircle.center.x;
        const dy = snowball.center.y - PalmCircle.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy)
        const radiusSum = (snowball.max.x-snowball.center.x) + (PalmCircle.max.x - PalmCircle.center.x);
        return distance < radiusSum;
    }

    private checkCastleCollision(snowball: Snowball): boolean {
        const snowballCoord = snowball.getCoordinates();


        const closestX = Math.max(this.castleLeft, Math.min(snowballCoord.x, this.castleRight));
        const closestY = Math.max(this.castleTop, Math.min(snowballCoord.y, this.castleBottom));

        const distanceX = snowballCoord.x - closestX;
        const distanceY = snowballCoord.y - closestY;
        const distance = Math.sqrt(distanceX * distanceX + distanceY * distanceY);

        if (distance < snowballCoord.radius) {
            gameController.castleHealth -= 1;
            this.setScoreBoard();
            if (gameController.castleHealth <= 0) {
                this.endGame();
            }
            return true;
        }
        return false;
    }

    private startTimer(): void {
        let timer = 45;
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

            if (timer <= 0) {
                clearInterval(this.timerInterval as NodeJS.Timeout);
                this.timerInterval = null;
                this.endGame()
            }
        }, 1000)

    }

    private endGame(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.ctx.fillStyle = "red";
        this.ctx.font = "bold 30pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("A játéknak vége!" + gameController.score, this.cvWidth / 2, this.cvHeight / 2);
        clearInterval(this.intervalId as NodeJS.Timeout);
        clearInterval(this.timerInterval as NodeJS.Timeout);
        cancelAnimationFrame(this.detectCollison as number);
        this.timerCtx.clearRect(0, 0, this.timerCanvas.width, this.timerCanvas.height);
        this.showGameResults();
        setTimeout(() => {
            this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight)
            if (!gameController.menuController) return;
            gameController.isInGame = false;
            gameController.menuController?.drawMenu();
            // garbage collector
            gameController.menuController.game = null;
            this.snowballs = [];
            this.castleHealth = 0;
        }, 5000)
    }

    private setScoreBoard(): void {
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
        this.timerCtx.fillText("Élet: " + gameController.castleHealth, this.cvWidth - 50, this.timerCanvas.height / 2);

    }

    private drawGame(): void {
        this.startTimer();
        this.spawnSnowballs();
        this.setScoreBoard();
    }

    private drawCastle(): void {
        this.ctx.globalAlpha = 0.75;
        if (this.serverImage && this.serverImage.complete) {
            this.ctx.drawImage(
                this.serverImage,
                this.castleX - this.castleWidth/2,
                this.castleY - this.castleHeight,
                this.castleWidth,
                this.castleHeight
            );
        } else {
            this.ctx.fillStyle = "rgba(0, 0, 255, 0.5)";
            this.ctx.fillRect(
                this.castleX - this.castleWidth / 2,
                this.castleY - this.castleHeight,
                this.castleWidth,
                this.castleHeight
            );

            this.serverImage.onload = () => {
                this.ctx.drawImage(
                    this.serverImage,
                    this.castleX - this.castleWidth/2,
                    this.castleY - this.castleHeight,
                    this.castleWidth,
                    this.castleHeight
                );
            };
        }

        this.ctx.globalAlpha = 1.0;
        
    }

    private spawnSnowballs(): void {
        const snowballCount = 5;
        this.snowballs = [];

        const createSnowball = () => {
            let x, y, speedX, speedY;
            const radius = 20;

            const edge = Math.floor(Math.random() * 4);
            if (edge === 0){
                x = 0;
                y = Math.random() * this.cvHeight;
            } else if (edge === 1) {
                x = this.cvWidth;
                y = Math.random() * this.cvHeight;
            } else if (edge === 2) {
                x = Math.random() * this.cvWidth;
                y = 0;
            } else {
                do {
                    x = Math.random() * this.cvWidth;
                    y = this.cvHeight;
                } while ( x > this.castleLeft - radius && x < this.castleRight + radius);
               
            }

            const targetX = this.castleX;
            const targetY = this.castleY - this.castleHeight / 2;

            const deltaX = targetX - x;
            const deltaY = targetY - y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            speedX = (deltaX / distance) * 1;
            speedY = (deltaY / distance) * 1;

            const snowball = new Snowball(this.cvWidth, this.cvHeight, this.ctx, 'assets/nonFriendlyVirus.svg');
            snowball.setPosition(x, y);
            snowball.setSpeed(speedX, speedY);
            return snowball;
        }
        
        for (let i = 0; i < snowballCount; i++) {
             this.snowballs.push(createSnowball());
        }

        const updateAndDraw = () => {
            this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
            this.drawCastle();

            this.snowballs.forEach((snowball, index) => {
                snowball.update();
                snowball.draw();

                if (this.checkCastleCollision(snowball)) {
                    this.snowballs.splice(index, 1);
                }

                if (snowball.getCoordinates().y > this.cvHeight || snowball.getCoordinates().y < 0 
                || snowball.getCoordinates().x > this.cvWidth || snowball.getCoordinates().x < 0) {
                    this.snowballs.splice(index, 1);

                }
            });

            while (this.snowballs.length < snowballCount) {
                this.snowballs.push(createSnowball());
            }

            if (gameController.castleHealth > 0 && this.timerInterval) {
                requestAnimationFrame(updateAndDraw);
            } else {
                this.endGame();
            }
        };
        updateAndDraw();
    }

    private showGameResults(): void {
        this.ctx.clearRect(0, 0, this.cvWidth, this.cvHeight);
        this.ctx.beginPath();
        this.ctx.roundRect(this.cvWidth / 2 - 225, this.cvHeight / 2 - 150, 450, 300, [15]);
        this.ctx.fillStyle = "rgba(255,99,0,0.65)";
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 25pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("Megmaradt élet: " + gameController.castleHealth, this.cvWidth / 2, this.cvHeight / 2 - 50);
        this.ctx.fillText("Kivédett támadások: " + gameController.score, this.cvWidth / 2, this.cvHeight / 2 );
        this.ctx.fillText("Végső pontszám: " + (gameController.castleHealth+1)*(gameController.score*10), this.cvWidth / 2, this.cvHeight / 2 + 50 );
    }

}

