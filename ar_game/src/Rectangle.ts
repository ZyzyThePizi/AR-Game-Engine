export class Rectangle {
    private xpos: number;
    private ypos: number;
    private color: string;
    private text: string;
    private speed: number;

    private cvWidth: number;
    private cvHeight: number;

    private dx: number;

    private ctx: any;

    constructor(xpos: number, ypos: number, color: string, text: string, speed: number, cvWidth: number, cvHeight: number, ctx: any) {
        this.xpos = xpos;
        this.ypos = ypos;
        this.color = color;
        this.text = text;
        this.speed = speed;
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;

        this.dx = 1 * this.speed;

        this.ctx = ctx;
    }

    draw(): void {
        this.ctx.fillStyle = this.color;
        this.ctx.fillRect(this.xpos, this.ypos, 50, 50)
    }

    update():void  {

        this.ctx.clearRect(0,0, this.cvWidth, this.cvHeight);
        this.draw();

        this.xpos += this.dx;
    }


}