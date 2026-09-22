import {Component, ElementRef, HostListener, OnInit, ViewChild} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {DrawingUtils, FilesetResolver, PoseLandmarker} from '@mediapipe/tasks-vision';
import {Menu} from "./menu/Menu";
import {MenuElement} from "../interfaces/MenuElement";
import {GameType} from "../DataTypes/GameTypes";
import { gameController } from "../environments/environment";

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

  constructor(private toastr: ToastrService) {
    // init menu data
    this.squeres = [
      {
        gameType: GameType.SaveTheServer, color: "#2f80ed",
        icon: "assets/server.svg", badge: "assets/nonFriendlyVirus.svg",
        description: "Kapd el a vírusokat, mielőtt elérik a szervert!"
      },
      {
        gameType: GameType.FilterTheTraffic, color: "#f2994a",
        icon: "assets/friendlyPackage.svg", badge: "assets/nonFriendlyVirus.svg",
        description: "Gyűjtsd a jó csomagokat, a vírusokat kerüld el!"
      },
      {
        gameType: GameType.PatchTheServer, color: "#27ae60",
        icon: "assets/patchServerOutdated.svg", badge: "assets/patchWrench.svg",
        description: "Tartsd a kezed az elavult szervereken, és javítsd meg őket!"
      },
    ];
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
    this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: "GPU"
      },
      runningMode: this.runningMode,
      numPoses: 2
    });
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
    (event.target as HTMLButtonElement).innerText = this.webcamRunning ? "DISABLE PREDICTIONS" : "ENABLE PREDICTIONS";

    if (this.webcamRunning) {
      setTimeout(() => this.startMenu(), 1000);
      this.startWebcam();
    }
  }

  private startWebcam() {
    navigator.mediaDevices.getUserMedia({ video: {width: {ideal: 640}, height: {ideal: 480} ,frameRate: {ideal: 10, max: 15}} }).then((stream) => {
      this.video.srcObject = stream;
      this.video.addEventListener("loadeddata", () => this.predictWebcam());
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

    const [leftShoulder, rightShoulder, , , leftWrist, rightWrist, ,leftPalm, , , rightPalm] = reducedLandmarks[0];
    gameController.leftWrist = leftWrist;
    gameController.rightWrist = rightWrist;
    gameController.leftShoulder = leftShoulder;
    gameController.rightShoulder = rightShoulder;
    gameController.leftPalm = leftPalm;
    gameController.rightPalm = rightPalm;
    // the menu runs its own animation loop and reads the hands from gameController

    if (this.drawJoints) {
      this.baseCanvasCtx.clearRect(0,0, this.videoWidth, this.videoHeight);
      reducedLandmarks.forEach((landmark: any) => {
        this.drawingUtils.drawLandmarks(landmark, { radius: 4, color: 'purple' });
      });
    }
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
