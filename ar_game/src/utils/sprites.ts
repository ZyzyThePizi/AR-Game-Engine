// Bitmap cache for the SVG artwork. Drawing an SVG <img> re-rasterizes vector paths, and
// shadowBlur glows are the most expensive canvas operation; both are done once here into
// small offscreen canvases, so per frame the games only blit bitmaps.
// Sprites are keyed by image src + size, so they survive from one game to the next.

export interface Sprite {
    canvas: HTMLCanvasElement,
    pad: number             // extra border around the image (room for a glow)
}

const cache = new Map<string, Sprite>();

function newCanvas(width: number, height: number): { canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    return { canvas: canvas, ctx: canvas.getContext("2d")! };
}

// The image rasterized at w x h. Null until the image has loaded.
export function imageSprite(image: HTMLImageElement, w: number, h: number): Sprite | null {
    if (!image.complete || !image.naturalWidth) return null;
    const key = image.src + "|" + Math.round(w) + "x" + Math.round(h);
    let sprite = cache.get(key);
    if (!sprite) {
        const { canvas, ctx } = newCanvas(w, h);
        ctx.drawImage(image, 0, 0, w, h);
        sprite = { canvas: canvas, pad: 0 };
        cache.set(key, sprite);
    }
    return sprite;
}

// Only the glow around the image's silhouette (the image itself is not in it), baked with
// shadowBlur once. Draw it under the image with a changing globalAlpha to animate the glow.
export function glowSprite(image: HTMLImageElement, w: number, h: number, color: string, blur: number): Sprite | null {
    if (!image.complete || !image.naturalWidth) return null;
    const key = image.src + "|" + Math.round(w) + "x" + Math.round(h) + "|glow|" + color + "|" + blur;
    let sprite = cache.get(key);
    if (!sprite) {
        const pad = Math.ceil(blur * 1.5);
        const { canvas, ctx } = newCanvas(w + pad * 2, h + pad * 2);
        // draw the image far off-canvas and shift only its shadow back into view
        const offset = w + pad * 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX = offset;
        ctx.drawImage(image, pad - offset, pad, w, h);
        sprite = { canvas: canvas, pad: pad };
        cache.set(key, sprite);
    }
    return sprite;
}

// Draws a sprite so that the image (not its padding) lands at x, y with size w x h.
export function drawSprite(ctx: any, sprite: Sprite, x: number, y: number, w: number, h: number): void {
    const scaleX = w / (sprite.canvas.width - sprite.pad * 2);
    const scaleY = h / (sprite.canvas.height - sprite.pad * 2);
    ctx.drawImage(sprite.canvas, x - sprite.pad * scaleX, y - sprite.pad * scaleY,
        sprite.canvas.width * scaleX, sprite.canvas.height * scaleY);
}

// Any drawing, rendered once into a cached canvas (e.g. a menu card). `key` must change
// whenever the drawing would.
export function cachedDrawing(key: string, width: number, height: number, draw: (ctx: any) => void): HTMLCanvasElement {
    let sprite = cache.get(key);
    if (!sprite) {
        const { canvas, ctx } = newCanvas(width, height);
        draw(ctx);
        sprite = { canvas: canvas, pad: 0 };
        cache.set(key, sprite);
    }
    return sprite.canvas;
}
