export class Rectangle {
    private xpos: number;
    private ypos: number;
    private color: string;
    private text: string;
    private speed: number;

    private isBackward: boolean;

    public Xpos():number { return this.xpos }

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

        this.isBackward = cvWidth == xpos ? true: false;

        this.dx = 1 * this.speed;

        this.ctx = ctx;
    }

    draw(): void {

        this.ctx.shadowColor = '#898';
        this.ctx.shadowBlur = 20;
        this.ctx.shadowOffsetX = 10;
        this.ctx.shadowOffsetY = 10;

        this.ctx.borderRadius = '10px'


        this.ctx.beginPath();
        this.ctx.roundRect(this.xpos - 170, this.ypos, 150, 50,[10]);
        this.ctx.fillStyle = this.color;
        this.ctx.fill();
        this.ctx.closePath();

        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 20pt Arial';
        this.ctx.fillText(this.text, this.xpos + 75 - 170, this.ypos+25)
    }

    update(): void {
        this.ctx.clearRect(0, 0, this.cvWidth + 740, this.cvHeight + 500);
        if (!this.isBackward) {
            this.xpos += this.dx;
            if (this.xpos < this.cvWidth + 730) {
                this.draw();
            }
        }
        else {
            this.xpos -= this.dx;
            if (this.xpos > 0) {
                this.draw();
            }
        }
    }
}