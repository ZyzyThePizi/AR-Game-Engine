import {MenuElement} from "./MenuElement";
import {ObjectCoordinates} from "./ObjectCoordinates";

export class Menu {

    private cvWidth: number;
    private cvHeight: number;

    private menuList: MenuElement[];
    private ctx: any;

    private centerX: number;
    private currentx: number = 0 ;
    private currenty: number = 0 ;

    private menuHeight: number;
    private squereHeight: number;
    private squereWidth: number;
    private centerIndex: number;

    private isScrolling: boolean = false;

    constructor(cvWidth: number, cvHeight: number, ctx: any, menuList: MenuElement[]) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.menuList = menuList;
        this.ctx = ctx;

        this.centerIndex = 1;
        this.menuHeight = 150;
        this.squereHeight = 100;
        this.squereWidth = 200;
        this.centerX = this.cvWidth / 2 - this.squereWidth / 2;
    }

    getCenterNormalized(): ObjectCoordinates{
        const centerY = (this.menuHeight - this.squereHeight) / 2;

        const min = {
            x: this.centerX / this.cvWidth,
            y: centerY / this.cvHeight
        };

        const max = {
            x: (this.centerX + this.squereWidth) / this.cvWidth,
            y: (centerY + this.squereHeight) / this.cvHeight
        };

        const center = {
            x: (this.centerX + this.squereWidth / 2) / this.cvWidth,
            y: (centerY + this.squereHeight / 2) / this.cvHeight
        };

        return {
            min: min,
            max: max,
            center: center
        };

    }

    drawEscape(): void{
        this.ctx.beginPath();
        this.ctx.arc(50, this.cvHeight-50, 40, 0, 2 * Math.PI);
        this.ctx.fillStyle = "#e32636";
        this.ctx.fill();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "black";
        this.ctx.stroke()

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 35pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText('X', 50, this.cvHeight - 50);
    }

    drawEnter(): void{
        this.ctx.beginPath();
        this.ctx.arc(this.cvWidth - 50, this.cvHeight-50, 40, 0, 2 * Math.PI);
        this.ctx.fillStyle = "#8db600";
        this.ctx.fill();
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "black";
        this.ctx.stroke()

        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 40pt Arial";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText('✔', this.cvWidth - 50, this.cvHeight - 50);
    }

    drawHorizontalScroolbar(){
        this.ctx.clearRect(0, 0, this.cvWidth, this.menuHeight);

        const spacing = 300;

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
            this.ctx.fillText(this.menuList[i].text, xPosition + this.squereWidth / 2, yPosition + this.squereHeight / 2);
        }
    }

    drawAllElements() {
        this.drawHorizontalScroolbar();
        this.drawEscape();
        this.drawEnter();
    }


    onMenuEnter(x:number, y:number) {
        this.currentx = x;
        this.currenty = y;

        const isInMiddleElement = (x <= this.getCenterNormalized().max.x && x >= this.getCenterNormalized().min.x)
            && (y <= this.getCenterNormalized().max.y && y >= this.getCenterNormalized().min.y);

        if (!isInMiddleElement || this.isScrolling) return;
        else {
            this.isScrolling = true;
            setTimeout(()=> {
                this.onScroll(this.currentx,this.currenty);
                this.isScrolling = false;
            }, 1500);
        }
    }

   private onScroll(x:number, y:number){
        if (x < this.getCenterNormalized().center.x) {
            this.onLeftScroll();
        }
        else if(x > this.getCenterNormalized().center.x) {
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