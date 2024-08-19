export class Sphere {

    private cvWidth: number;
    private cvHeight: number;
    private ctx: any;

    private radius = 20;
    private speed: number;

    private isFriendly: boolean;

    private current_y = -this.radius;
    private current_x: number;

    private animationNumber: any = null;

    constructor(cvWidth: number, cvHeight: number, isFriendly: boolean ,ctx: any) {
        this.cvWidth = cvWidth;
        this.cvHeight = cvHeight;
        this.ctx = ctx;
        this.isFriendly = isFriendly;

        this.current_x = this.getRandomInt(20, this.cvWidth - 20);
        this.speed = isFriendly ? 3 : 2 ;

        this.startSphere();
    }


    startSphere() {
        this.animationNumber = requestAnimationFrame(() => {
            this.updateSphere();
        })
    }

    drawSphere() {
            this.ctx.beginPath();
            this.ctx.arc(this.current_x, this.current_y, this.radius, 0, 2 * Math.PI);
            this.ctx.fillStyle = this.isFriendly ? "#1edf16" : "#c60000";
            this.ctx.fill();
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = "black";
            this.ctx.stroke();
    }

    stopSphere() {
        if (this.animationNumber !== null) {
            cancelAnimationFrame(this.animationNumber);
        }
    }

    updateSphere() {
        this.ctx.clearRect(this.current_x - this.radius-1, this.current_y - this.radius-1, 42, 42);
        this.current_y += this.speed;
        this.drawSphere();

        if (this.current_y - this.radius >= this.cvHeight) {
            this.current_y = -this.radius;
            this.current_x = this.getRandomInt(20, this.cvWidth - 20);
        }

        this.animationNumber = requestAnimationFrame(() => {
            this.updateSphere();
        });
    }

    getRandomInt(min: number, max: number) {
        const minCeiled = Math.ceil(min);
        const maxFloored = Math.floor(max);
        return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled); // The maximum is exclusive and the minimum is inclusive
    }

}