import {Component, ElementRef, HostListener, NgZone, OnInit, ViewChild} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {DrawingUtils, FilesetResolver, NormalizedLandmark, PoseLandmarker} from '@mediapipe/tasks-vision';
import {Menu} from "./menu/Menu";
import {MenuElement} from "../interfaces/MenuElement";
import {GameType} from "../DataTypes/GameTypes";
import { gameController } from "../state/gameController";
import { onSettingsChange, settings } from "../state/settings";
import { t, TextKey } from "../utils/i18n";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  @ViewChild('stage', { static: true }) stageRef!: ElementRef<HTMLElement>;

  poseLandmarker: PoseLandmarker = {} as PoseLandmarker;
  runningMode: "IMAGE" | "VIDEO" = "IMAGE";
  webcamRunning: boolean = false;
  videoHeight = 720;  //660 | 669
  videoWidth = 960;   //880 | 892
  video!: HTMLVideoElement;
  baseCanvas!: HTMLCanvasElement;
  topCanvas!: HTMLCanvasElement;
  baseCanvasCtx!: CanvasRenderingContext2D;
  topCanvasCtx!: CanvasRenderingContext2D;
  drawingUtils!: DrawingUtils;
  squeres: MenuElement[];
  drawJoints = false;
  stageScale = 1;
  isFullscreen = false;
  private mediaStream: MediaStream | null = null;

  constructor(private toastr: ToastrService, private ngZone: NgZone) {
    // init menu data
    this.squeres = [
      {
        gameType: GameType.SaveTheServer, color: "#2f80ed",
        icon: "assets/server.svg", badge: "assets/nonFriendlyVirus.svg",
        description: {
          hu: "Kapd el a vírusokat, mielőtt elérik a szervert!",
          en: "Catch the viruses before they reach the server!"
        }
      },
      {
        gameType: GameType.FilterTheTraffic, color: "#f2994a",
        icon: "assets/friendlyPackage.svg", badge: "assets/nonFriendlyVirus.svg",
        description: {
          hu: "Gyűjtsd a jó csomagokat, a vírusokat kerüld el!",
          en: "Collect the good packages, dodge the viruses!"
        }
      },
      {
        gameType: GameType.PatchTheServer, color: "#27ae60",
        icon: "assets/patchServerOutdated.svg", badge: "assets/patchWrench.svg",
        description: {
          hu: "Tartsd a kezed az elavult szervereken, és javítsd meg őket!",
          en: "Hold your hand on outdated servers to patch them!"
        }
      },
    ];

    // the language is changed from the canvas menu, outside Angular's zone: re-render the sidebar
    document.documentElement.lang = settings.language;
    onSettingsChange(() => this.ngZone.run(() => document.documentElement.lang = settings.language));
  }

  // sidebar texts follow the language chosen in the menu's settings
  text(key: TextKey): string {
    return t(key);
  }

  async ngOnInit() {
    this.fitStage();
    await this.createPoseLandmarker();
    this.fitStage();
    // get html elements
    this.initializeCanvasElements();
    // width of canvases and vide frame (for camera)
    this.setupCanvasDimensions();
    gameController.menuController = new Menu(this.videoWidth, this.videoHeight, this.topCanvasCtx, this.squeres);
  }


  async createPoseLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    const options = (delegate: "GPU" | "CPU") => ({
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: delegate
      },
      runningMode: this.runningMode,
      // only one player is ever read (see processLandmarks); tracking a second
      // person here would double the pose-inference cost for nothing
      numPoses: 1
    });
    try {
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, options("GPU"));
    } catch (error) {
      // no usable WebGL (old driver, blocklisted GPU, remote desktop): run on the CPU instead of not at all
      console.warn("GPU pose tracking unavailable, falling back to CPU", error);
      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, options("CPU"));
    }
    document.getElementById("demos")?.classList.remove("invisible");
  }

  private initializeCanvasElements() {
    this.video = document.getElementById("webcam") as HTMLVideoElement;
    this.baseCanvas = document.getElementById("base_canvas") as HTMLCanvasElement;
    this.topCanvas = document.getElementById("top_canvas") as HTMLCanvasElement;
    this.baseCanvasCtx = this.baseCanvas.getContext("2d")!;
    this.topCanvasCtx = this.topCanvas.getContext("2d")!;
    this.drawingUtils = new DrawingUtils(this.baseCanvasCtx);
  }

  private setupCanvasDimensions() {
    this.baseCanvas.width = this.videoWidth;
    this.baseCanvas.height = this.videoHeight;
    this.topCanvas.width = this.videoWidth;
    this.topCanvas.height = this.videoHeight;
    this.video.style.height = `${this.videoHeight}px`;
    this.video.style.width = `${this.videoWidth}px`;
  }

  enableCam(event: any) {
    if (!this.poseLandmarker) {
      console.log("Wait! poseLandmaker not loaded yet.");
      return;
    }

    this.webcamRunning = !this.webcamRunning;

    if (this.webcamRunning) {
      // run the detection/menu/game loops outside Angular's zone: they call
      // requestAnimationFrame every frame, and zone.js re-triggers change detection
      // after every rAF callback unless it was scheduled from outside the zone
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => this.startMenu(), 1000);
        this.startWebcam();
      });
    } else {
      // free the camera immediately instead of waiting for the next enable to replace it
      this.mediaStream?.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  private startWebcam() {
    navigator.mediaDevices.getUserMedia({ video: {width: {ideal: 640}, height: {ideal: 480} ,frameRate: {ideal: 10, max: 15}} }).then((stream) => {
      // stop any stream left over from a previous enable, so toggling the webcam
      // off and on again never leaves two cameras (and two detection loops) running
      this.mediaStream?.getTracks().forEach(track => track.stop());
      this.mediaStream = stream;
      this.video.srcObject = stream;
      // { once: true }: a repeated "loadeddata" (e.g. after re-enabling) would
      // otherwise start an extra, duplicate predictWebcam() loop
      this.video.addEventListener("loadeddata", () => this.predictWebcam(), { once: true });
    });
  }

  private async predictWebcam() {
    if (this.runningMode === "IMAGE") {
      this.runningMode = "VIDEO";
      await this.poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let lastVideoTime = -1;
    const predict = () => {
      const currentTime = this.video.currentTime;
      if (lastVideoTime !== currentTime) {
        lastVideoTime = currentTime;
        this.poseLandmarker.detectForVideo(this.video, performance.now(), (result) => {
          this.processLandmarks(result.landmarks);
        });
      }
      if (this.webcamRunning) {
        window.requestAnimationFrame(predict);
      }
    };

    predict();
  }

  private processLandmarks(landmarks: any) {
    const reducedLandmarks = landmarks.map((landmark: any) => [
      landmark[11], landmark[12], landmark[13], landmark[14],
      landmark[15], landmark[16], landmark[17], landmark[18],
      landmark[19], landmark[20], landmark[21], landmark[22]
    ]);

    if (!reducedLandmarks[0]) return;

    const [leftShoulder, rightShoulder, , , leftWrist, rightWrist] = reducedLandmarks[0];
    gameController.leftWrist = leftWrist;
    gameController.rightWrist = rightWrist;
    gameController.leftShoulder = leftShoulder;
    gameController.rightShoulder = rightShoulder;
    // pose landmarks: 13/14 elbows, 15/16 wrists
    gameController.leftPalm = this.handPoint(landmarks[0][13], leftWrist);
    gameController.rightPalm = this.handPoint(landmarks[0][14], rightWrist);
    // the menu runs its own animation loop and reads the hands from gameController

    if (this.drawJoints) {
      this.baseCanvasCtx.clearRect(0,0, this.videoWidth, this.videoHeight);
      reducedLandmarks.forEach((landmark: any) => {
        this.drawingUtils.drawLandmarks(landmark, { radius: 4, color: 'purple' });
      });
      // the points the games actually use
      const hands = [gameController.leftPalm, gameController.rightPalm].filter(hand => !!hand);
      this.drawingUtils.drawLandmarks(hands as any, { radius: 9, color: 'lime' });
    }
  }

  // Where the hand is, estimated along the forearm: wrist + 0.35 x (wrist - elbow) lands on the
  // palm center. The pose model's finger points (pinky/index/thumb) jump around when a hand is
  // held edge-on, pointed or closed; elbow and wrist stay reliable in every hand pose.
  // A hand outside the camera frame (e.g. hanging below it) gives no point at all.
  private handPoint(elbow: any, wrist: any): NormalizedLandmark | null {
    if (!wrist) return null;
    const k = elbow ? 0.35 : 0;
    const x = wrist.x + (wrist.x - (elbow?.x ?? wrist.x)) * k;
    const y = wrist.y + (wrist.y - (elbow?.y ?? wrist.y)) * k;
    if (x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02) return null;
    return { x: x, y: y, z: wrist.z, visibility: wrist.visibility };
  }

  setDrawJoints(){ this.drawJoints = !this.drawJoints; }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
    this.fitStage();
  }

  // scale the fixed 960x720 game world to fill the stage; hit tests are normalized, so they are unaffected
  @HostListener('window:resize')
  fitStage() {
    const stage = this.stageRef.nativeElement;
    this.stageScale = Math.min(stage.clientWidth / this.videoWidth, stage.clientHeight / this.videoHeight);
  }

  startMenu() {
    gameController.menuController?.drawMenu();
  }
}
