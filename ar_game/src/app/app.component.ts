import {Component, ElementRef, HostListener, NgZone, OnInit, ViewChild} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {DrawingUtils, FilesetResolver, PoseLandmarker} from '@mediapipe/tasks-vision';
import {Menu} from "./menu/Menu";
import {MenuElement} from "../interfaces/MenuElement";
import {GameType} from "../DataTypes/GameTypes";
import { gameController } from "../state/gameController";
import { isMikulas, onSettingsChange, settings } from "../state/settings";
import { t, TextKey } from "../utils/i18n";
import { PlayerTracker } from "../utils/handTracking";

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
  readonly lightBulbs = new Array(9);    // the light string above the logo (Mikulás theme)
  isFullscreen = false;
  private mediaStream: MediaStream | null = null;
  private playerTracker = new PlayerTracker();

  constructor(private toastr: ToastrService, private ngZone: NgZone) {
    // init menu data
    this.squeres = [
      {
        gameType: GameType.SaveTheServer, color: "#2f80ed",
        icon: "assets/server.svg", badge: "assets/nonFriendlyVirus.svg",
        description: {
          hu: "Kapd el a vírusokat, mielőtt elérik a szervert!",
          en: "Catch the viruses before they reach the server!"
        },
        mikulas: {
          color: "#2f80ed",
          icon: "assets/mikulas/snowman.svg", badge: "assets/mikulas/fireball.svg",
          description: {
            hu: "Kapd el a tűzgolyókat, mielőtt megolvasztják a hóembert!",
            en: "Catch the fireballs before they melt the snowman!"
          }
        }
      },
      {
        gameType: GameType.FilterTheTraffic, color: "#f2994a",
        icon: "assets/friendlyPackage.svg", badge: "assets/nonFriendlyVirus.svg",
        description: {
          hu: "Gyűjtsd a jó csomagokat, a vírusokat kerüld el!",
          en: "Collect the good packages, dodge the viruses!"
        },
        mikulas: {
          color: "#d62839",
          icon: "assets/mikulas/gift.svg", badge: "assets/mikulas/coal.svg",
          description: {
            hu: "Kapd el a játékokat, a szenet és a virgácsot kerüld el!",
            en: "Catch the toys, dodge the coal and the birch switch!"
          }
        }
      },
      {
        gameType: GameType.PatchTheServer, color: "#27ae60",
        icon: "assets/patchServerOutdated.svg", badge: "assets/patchWrench.svg",
        description: {
          hu: "Tartsd a kezed az elavult szervereken, és javítsd meg őket!",
          en: "Hold your hand on outdated servers to patch them!"
        },
        mikulas: {
          color: "#1f8f4e",
          icon: "assets/mikulas/boot.svg", badge: "assets/mikulas/brush.svg",
          description: {
            hu: "Tartsd a kezed a sáros csizmákon, és pucold ki őket!",
            en: "Hold your hand on muddy boots to shine them!"
          }
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

  // the Mikulás theme adds snow and lights around the games (see the template)
  get mikulas(): boolean {
    return isMikulas();
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
    const pose = landmarks[0] ?? null;
    // steadies the points (dropouts, a bystander, jitter) and writes them into gameController;
    // the menu and the games run their own loops and read the hands from there
    this.playerTracker.update(pose, performance.now());

    if (this.drawJoints) {
      this.baseCanvasCtx.clearRect(0,0, this.videoWidth, this.videoHeight);
      // upper body: shoulders, elbows, wrists, fingers
      if (pose) this.drawingUtils.drawLandmarks(pose.slice(11, 23), { radius: 4, color: 'purple' });
      // the points the games actually use
      const hands = [gameController.leftPalm, gameController.rightPalm].filter(hand => !!hand);
      this.drawingUtils.drawLandmarks(hands as any, { radius: 9, color: 'lime' });
    }
  }

  setDrawJoints(){
    this.drawJoints = !this.drawJoints;
    if (!this.drawJoints) this.baseCanvasCtx?.clearRect(0, 0, this.videoWidth, this.videoHeight);
  }

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
