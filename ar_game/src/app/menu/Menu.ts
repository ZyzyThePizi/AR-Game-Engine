import { MenuElement } from "../../interfaces/MenuElement";
import { GameType } from "../../DataTypes/GameTypes";
import { gameController } from "../../environments/environment";
import { FallingStar } from "../games/FallingStar";
import * as normalizationUtils from "../../utils/normalizationMethods";
import { SaveTheServer } from "../games/SaveTheServer";
import { PatchTheServer } from "../games/PatchTheServer";

export class Menu {

    private cvWidth: number;
    private cvHeight: number;

    private menuList: MenuElement[];
    private ctx: any;

    private centerX: number;
    private currentx: number = 0 ;
    private currenty: number = 0 ;

    private readonly menuHeight = 150;
    private readonly squereHeight = 100;
    private readonly squereWidth = 200;

    private centerIndex= 1;
    private enterButtonCenterX: number;
    private enterButtonCenterY: number;
    private enterButtonRadius: number = 40;

    private isScrolling: boolean = false;
    private isEnterInAction: boolean = false;

    public game: any = undefined;

    constructor(cvWidth: number, cvHeight: number, ctx: any, menuList: MenuElement[]) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.menuList = menuList;
        this.ctx = ctx;

        this.centerX = this.cvWidth / 2 - this.squereWidth / 2;
        this.enterButtonCenterX = this.cvWidth - 50;
        this.enterButtonCenterY = this.cvHeight - 50;
    }

    drawEnter(): void{
        this.ctx.beginPath();
        this.ctx.arc(this.enterButtonCenterX, this.enterButtonCenterY, this.enterButtonRadius, 0, 2 * Math.PI);
        this.ctx.fillStyle = "#8db600";
        this.ctx.fill();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "black";
        this.ctx.stroke()

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 40pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText('✔', this.enterButtonCenterX, this.enterButtonCenterY);
    }


    drawMenu() {
        this.drawHorizontalScroolbar();
        this.drawEnter();
        gameController.isInMenu = true;
    }

    drawHorizontalScroolbar(){
        this.ctx.clearRect(0, 0, this.cvWidth, this.menuHeight);

        const spacing = 4000;

        for (let i = 0; i < this.menuList.length; i++) {
            let xPosition = this.centerX + (i - this.centerIndex) * (this.squereWidth + spacing);
            let yPosition = (this.menuHeight - this.squereHeight) / 2;

            this.ctx.beginPath();
            this.ctx.roundRect(xPosition, yPosition, this.squereWidth, this.squereHeight,[10]);
            this.ctx.fillStyle = this.menuList[i].color;
            this.ctx.fill();
            this.ctx.closePath();

            this.ctx.fillStyle = "#FFFFFF";
            this.ctx.font = "bold 15pt Arial";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(this.menuList[i].gameType, xPosition + this.squereWidth / 2, yPosition + this.squereHeight / 2);
        }
    }

    onEnter(x: number, y: number){
        x = (x * -1) + 1;
        this.currentx = x;
        this.currenty = y;

        const normalizedCircle = normalizationUtils.getNormalizedCircleMenu(this.menuHeight,this.enterButtonCenterX,
            this.enterButtonCenterY, this.enterButtonRadius, this.squereHeight, this.cvWidth, this.cvHeight)

        const isInElement = (x <= normalizedCircle.max.x && x >= normalizedCircle.min.x)
            && (y <= normalizedCircle.max.y && y >= normalizedCircle.min.y);

        if (!isInElement || this.isEnterInAction) return;
        else {
            this.isEnterInAction = true;
            setTimeout(()=> {
                this.initGame(this.currentx, this.currenty);
                this.isEnterInAction = false;
            }, 1500);
        }

    }

    onMenuEnter(x:number, y:number) {
        this.currentx = x;
        this.currenty = y;

        const rectangle = normalizationUtils.getCenterNormalized(this.menuHeight, this.squereHeight,
            this.squereWidth, this.cvWidth, this.cvHeight, this.centerX)

        const isInMiddleElement = (x <= rectangle.max.x && x >= rectangle.min.x)
            && (y <= rectangle.max.y && y >= rectangle.min.y);

        if (!isInMiddleElement || this.isScrolling) return;
        else {
            this.isScrolling = true;
            setTimeout(()=> {
                this.onScroll(this.currentx);
                this.isScrolling = false;
            }, 1500);
        }
    }

    initGame(x: number, y: number) {
        const normalizedCircle = normalizationUtils.getNormalizedCircleMenu(this.menuHeight,this.enterButtonCenterX,
            this.enterButtonCenterY, this.enterButtonRadius, this.squereHeight, this.cvWidth, this.cvHeight)

        const isInElement = (x <= normalizedCircle.max.x && x >= normalizedCircle.min.x)
            && (y <= normalizedCircle.max.y && y >= normalizedCircle.min.y);

        if (!isInElement) return;

        switch (this.menuList[this.centerIndex].gameType){
            case GameType.SaveTheServer:
                gameController.isInGame = true;
                gameController.isInMenu = false;
                this.game = new SaveTheServer(this.cvWidth, this.cvHeight, this.ctx);
                break
            case GameType.FallingStar:
                gameController.isInGame = true;
                gameController.isInMenu = false;
                this.game = new FallingStar(this.cvWidth, this.cvHeight, this.ctx);
                break
            case GameType.PatchTheServer:
                gameController.isInGame = true;
                gameController.isInMenu = false;
                this.game = new PatchTheServer(this.cvWidth, this.cvHeight, this.ctx);
                break
        }
    }

   private onScroll(x:number){
       const rectangle = normalizationUtils.getCenterNormalized(this.menuHeight, this.squereHeight,
           this.squereWidth, this.cvWidth, this.cvHeight, this.centerX)

        if (x < rectangle.center.x) {
            this.onLeftScroll();
        }
        else if(x > rectangle.center.x) {
            this.onRightScroll();
        }
    }

   private onLeftScroll(){
        if (this.centerIndex != this.menuList.length-1) {
            this.centerIndex++;
        }
        else {
            this.centerIndex = 0;
        }
       this.drawHorizontalScroolbar();
   }


   private onRightScroll(){
        if (this.centerIndex != 0) {
            this.centerIndex--;
        }
        else {
            this.centerIndex = this.menuList.length-1;
        }
       this.drawHorizontalScroolbar();
   }
}