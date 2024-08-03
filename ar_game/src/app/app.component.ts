import { Component, OnInit } from '@angular/core';
import { Rectangle } from '../Rectangle';
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from '@mediapipe/tasks-vision';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'pose-landmarker-app';
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

  async ngOnInit() {
    await this.createPoseLandmarker();
    this.video = document.getElementById("webcam") as HTMLVideoElement;
    this.baseCanvas = document.getElementById("base_canvas") as HTMLCanvasElement;
    this.topCanvas = document.getElementById("top_canvas") as HTMLCanvasElement;
    this.baseCanvasCtx = this.baseCanvas.getContext("2d")!;
    this.topCanvasCtx = this.topCanvas.getContext("2d")!;
    this.drawingUtils = new DrawingUtils(this.baseCanvasCtx);
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

  startObjects() {
    if (!this.webcamRunning) return;

    this.topCanvasCtx.clearRect(0, 0, this.videoWidth + 570, this.videoHeight + 500);

    const random_Y = Math.random() * this.videoHeight + 100;
    const rectangle = new Rectangle(0, random_Y, "orange", "KYNDRYL", this.getRandomInt(10,20), this.videoWidth, this.videoHeight, this.topCanvasCtx);
    let animationId: number;
    this.topCanvas.style.height = this.videoHeight + "px";
    this.topCanvas.style.width = this.videoWidth + "px";
    rectangle.draw();

    let updateRectangle = () => {
      rectangle.update();
      if (rectangle.Xpos() >= this.videoWidth + 730) {
        cancelAnimationFrame(animationId);
        this.startObjects();
      } else {
        animationId = requestAnimationFrame(updateRectangle);
      }
    }

    updateRectangle();
  }




  async predictWebcam() {
    this.baseCanvas.style.height = this.videoHeight + "px";
    this.video.style.height = this.videoHeight + "px";
    this.baseCanvas.style.width = this.videoWidth + "px";
    this.video.style.width = this.videoWidth + "px";

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
            landmark[11], // left shoulder
            landmark[12], // right shoulder
            landmark[13], // left elbow
            landmark[14], // right elbow
            landmark[15], // left wrist
            landmark[16], // right wrist
            landmark[17], // left pinky
            landmark[18], // right pinky
            landmark[19], // left index
            landmark[20], // right index
            landmark[21], // left thumb
            landmark[22], // right thumb
          ];
        });
        for (const landmark of reducedLandmarks) {
          this.drawingUtils.drawLandmarks(landmark,  {
            radius: 8,
            color: 'purple',
          });
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
}
