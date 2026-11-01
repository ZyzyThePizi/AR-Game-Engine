import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { gameController } from "../state/gameController";
import { OneEuroFilter } from "./handInput";

// Turns each raw pose result into steady shoulder and hand points in gameController.
// Raw MediaPipe output made the hand markers flicker in three ways, each handled here:
//  1. Short dropouts (a frame without a pose, or a hand bouncing on the edge of the picture):
//     the last point is kept for LOST_GRACE_MS, and a hand that left over the edge must come
//     clearly back inside before it shows again (hysteresis).
//  2. Another person in view: the model tracks one pose and can alternate between the player
//     and a bystander. A sudden jump of the body only counts once it has lasted SWITCH_MS.
//  3. Jitter: a light 1€ filter on the hand points (strong at rest, almost none while moving).

const LOST_GRACE_MS = 250;
const SWITCH_MS = 400;
const SWITCH_DISTANCE = 0.25;       // body-center jump (normalized) between two results that looks like another person
const EDGE_IN = 0.02;               // a hand shows when it is at most this far outside the picture...
const EDGE_OUT = 0.06;              // ...and is dropped only once it is further out than this
const PALM_REACH = 0.35;            // palm = wrist + 0.35 x (wrist - elbow)
// the filter works in canvas pixels, so it shares its tuning with DwellInput's filter
const WORLD_W = 960;
const WORLD_H = 720;

interface Point { x: number, y: number }

class HandTrack {
    private shown: NormalizedLandmark | null = null;
    private lostAt: number | null = null;
    private lastAt = 0;
    private filterX = new OneEuroFilter(2.5, 0.05);
    private filterY = new OneEuroFilter(2.5, 0.05);

    update(raw: NormalizedLandmark | null, now: number): NormalizedLandmark | null {
        const margin = this.shown ? EDGE_OUT : EDGE_IN;
        const inside = raw && raw.x >= -margin && raw.x <= 1 + margin && raw.y >= -margin && raw.y <= 1 + margin;
        if (raw && inside) {
            if (!this.shown) {
                // a fresh start: the filter must not slide over from where the hand was lost
                this.filterX = new OneEuroFilter(2.5, 0.05);
                this.filterY = new OneEuroFilter(2.5, 0.05);
            }
            const dt = this.shown ? (now - this.lastAt) / 1000 : 0;
            this.lastAt = now;
            this.lostAt = null;
            this.shown = {
                x: this.filterX.filter(raw.x * WORLD_W, dt) / WORLD_W,
                y: this.filterY.filter(raw.y * WORLD_H, dt) / WORLD_H,
                z: raw.z,
                visibility: raw.visibility
            };
            return this.shown;
        }
        if (!this.shown) return null;
        if (this.lostAt === null) this.lostAt = now;
        if (now - this.lostAt < LOST_GRACE_MS) return this.shown;
        this.shown = null;
        return null;
    }
}

export class PlayerTracker {

    private hands = [new HandTrack(), new HandTrack()];
    private center: Point | null = null;      // shoulder midpoint of the player being tracked
    private jumpSince: number | null = null;
    private lastPoseAt = -Infinity;

    // pose: the 33 pose landmarks of one person, or null when nobody was found this frame
    update(pose: NormalizedLandmark[] | null, now: number): void {
        if (pose && !this.isSamePlayer(pose, now)) pose = null;

        if (pose) {
            this.lastPoseAt = now;
            gameController.leftShoulder = pose[11];
            gameController.rightShoulder = pose[12];
            gameController.leftWrist = pose[15];
            gameController.rightWrist = pose[16];
        } else if (now - this.lastPoseAt > LOST_GRACE_MS) {
            // nobody there any more: no frozen shoulder zone or ghost hands
            gameController.leftShoulder = null;
            gameController.rightShoulder = null;
            gameController.leftWrist = null;
            gameController.rightWrist = null;
            this.center = null;
        }
        // pose landmarks: 13/14 elbows, 15/16 wrists
        gameController.leftPalm = this.hands[0].update(pose ? palmPoint(pose[13], pose[15]) : null, now);
        gameController.rightPalm = this.hands[1].update(pose ? palmPoint(pose[14], pose[16]) : null, now);
    }

    private isSamePlayer(pose: NormalizedLandmark[], now: number): boolean {
        const left = pose[11];
        const right = pose[12];
        if (!left || !right) return true;
        const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };

        const lostPlayer = now - this.lastPoseAt > LOST_GRACE_MS;
        const jump = this.center ? Math.hypot(center.x - this.center.x, center.y - this.center.y) : 0;
        if (!this.center || lostPlayer || jump < SWITCH_DISTANCE) {
            this.center = center;
            this.jumpSince = null;
            return true;
        }
        // somebody else, or the player moved very fast: believe it only once it lasts
        if (this.jumpSince === null) this.jumpSince = now;
        if (now - this.jumpSince < SWITCH_MS) return false;
        this.center = center;
        this.jumpSince = null;
        return true;
    }
}

// Where the hand is, estimated along the forearm: wrist + 0.35 x (wrist - elbow) lands on the
// palm center. The pose model's finger points (pinky/index/thumb) jump around when a hand is
// held edge-on, pointed or closed; elbow and wrist stay reliable in every hand pose.
function palmPoint(elbow: NormalizedLandmark | undefined, wrist: NormalizedLandmark | undefined): NormalizedLandmark | null {
    if (!wrist) return null;
    const k = elbow ? PALM_REACH : 0;
    return {
        x: wrist.x + (wrist.x - (elbow?.x ?? wrist.x)) * k,
        y: wrist.y + (wrist.y - (elbow?.y ?? wrist.y)) * k,
        z: wrist.z,
        visibility: wrist.visibility
    };
}
