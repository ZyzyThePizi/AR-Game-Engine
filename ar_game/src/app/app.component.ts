import {Component, OnInit} from '@angular/core';
import {ToastrService} from 'ngx-toastr';
import {DrawingUtils, FilesetResolver, PoseLandmarker} from '@mediapipe/tasks-vision';
import {Menu} from "./menu/Menu";
import {MenuElement} from "../interfaces/MenuElement";
import {GameType} from "../DataTypes/GameTypes";
import {gameController} from "../environments/environment";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {


  poseLandmarker: PoseLandmarker = {} as PoseLandmarker;
  runningMode: "IMAGE" | "VIDEO" = "IMAGE";
  webcamRunning: boolean = false;
  videoHeight = 540;
  videoWidth = 720;
  video!: HTMLVideoElement;
  baseCanvas!: HTMLCanvasElement;
  topCanvas!: HTMLCanvasElement;
  baseCanvasCtx!: CanvasRenderingContext2D;
  topCanvasCtx!: CanvasRenderingContext2D;
  drawingUtils!: DrawingUtils;
  squeres: MenuElement[];
  movingObjects = {
    label: 'Start objects',
    isMoving: false
  }
  drawJoints = false;

  constructor(private toastr: ToastrService) {
    // init menu data
    this.squeres = [
      { gameType: GameType.Racer, color: "#50b8e7"},
      { gameType: GameType.CoinCollector, color: "#50b8e7"},
      { gameType: GameType.Blazer, color: "#50b8e7"}
    ];
  }

  async ngOnInit() {
    await this.createPoseLandmarker();
    // get html elements
    this.video = document.getElementById("webcam") as HTMLVideoElement;
    this.baseCanvas = document.getElementById("base_canvas") as HTMLCanvasElement;
    this.topCanvas = document.getElementById("top_canvas") as HTMLCanvasElement;
    this.baseCanvasCtx = this.baseCanvas.getContext("2d")!;
    this.topCanvasCtx = this.topCanvas.getContext("2d")!;
    this.drawingUtils = new DrawingUtils(this.baseCanvasCtx);
    // width of canvases and vide frame (for camera)
    this.baseCanvas.width = this.videoWidth;
    this.baseCanvas.height = this.videoHeight;
    this.topCanvas.width = this.videoWidth;
    this.topCanvas.height = this.videoHeight;
    this.video.style.height = this.videoHeight + "px";
    this.video.style.width = this.videoWidth + "px";
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

  hasGetUserMedia() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  enableCam(event: any) {
    if (!this.poseLandmarker) {
      console.log("Wait! poseLandmaker not loaded yet.");
      return;
    }

    if (this.webcamRunning) {
      this.webcamRunning = false;
      (event.target as HTMLButtonElement).innerText = "ENABLE PREDICTIONS";
    } else {
      this.webcamRunning = true;
      setTimeout( () => { this.startMenu(); }, 1000);
      (event.target as HTMLButtonElement).innerText = "DISABLE PREDICTIONS";
    }

    const constraints = {
      video: true
    };

    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      this.video.srcObject = stream;
      this.video.addEventListener("loadeddata", () => this.predictWebcam());
    });
  }

  async predictWebcam() {
    if (this.runningMode === "IMAGE") {
      this.runningMode = "VIDEO";
      await this.poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let lastVideoTime = -1;
    let startTimeMs = performance.now();

    if (lastVideoTime !== this.video.currentTime) {
      lastVideoTime = this.video.currentTime;
      this.poseLandmarker.detectForVideo(this.video, startTimeMs, (result) => {
        this.baseCanvasCtx.save();
        this.baseCanvasCtx.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
        const reducedLandmarks = result.landmarks.map(landmark => {
          return [
            landmark[11], // left shoulder 0
            landmark[12], // right shoulder 1
            landmark[13], // left elbow 2
            landmark[14], // right elbow 3
            landmark[15], // left wrist 4
            landmark[16], // right wrist 5
            landmark[17], // left pinky 6
            landmark[18], // right pinky 7
            landmark[19], // left index 8
            landmark[20], // right index 9
            landmark[21], // left thumb 10
            landmark[22], // right thumb 11
          ];
        });

        if (!(reducedLandmarks[0] && reducedLandmarks[0][4] && reducedLandmarks[0][5])) return;
        gameController.leftWrist = reducedLandmarks[0][4];
        gameController.rightWrist = reducedLandmarks[0][5];

        if (gameController.isInMenu) {
          gameController.menuController?.onMenuEnter(gameController.leftWrist.x, gameController.leftWrist.y);
          gameController.menuController?.onMenuEnter(gameController.rightWrist.x, gameController.rightWrist.y);
          gameController.menuController?.onEnter(gameController.rightWrist.x, gameController.rightWrist.y);
        }

        /*console.log(normalizedLeftWrist)*/
        if (this.drawJoints) {
          for (const landmark of reducedLandmarks) {
            this.drawingUtils.drawLandmarks(landmark,  {
              radius: 4,
              color: 'purple',
            });
          }
        }
        this.baseCanvasCtx.restore();
      });
    }

    if (this.webcamRunning) {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  getRandomInt(min: number, max: number): number {
    const minCeiled = Math.ceil(min);
    const maxFloored = Math.floor(max);
    return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled);
  }

  setDrawJoints(){ this.drawJoints = !this.drawJoints; }

  startMenu() {
    console.log(gameController.menuController?.getCenterNormalized())
    gameController.menuController?.drawMenu();
  }
}
