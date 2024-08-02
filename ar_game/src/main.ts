import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils, NormalizedLandmark
} from '@mediapipe/tasks-vision';

const demosSection = document.getElementById("demos");

declare type RunningMode = "IMAGE" | "VIDEO";
let poseLandmarker: PoseLandmarker = {} as PoseLandmarker;
let runningMode = "IMAGE";
let enableWebcamButton: HTMLButtonElement;
let webcamRunning: Boolean = false;
const videoHeight = "360px";
const videoWidth = "480px";

// Before we can use PoseLandmarker class we must wait for it to finish
// loading. Machine Learning models can be large and take a moment to
// get everything needed to run.
const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "GPU"
        },
        runningMode: runningMode as RunningMode,
        numPoses: 2
    });
    demosSection?.classList.remove("invisible");
};
createPoseLandmarker();

const video = document.getElementById("webcam") as HTMLVideoElement;
const canvasElement = document.getElementById(
    "output_canvas"
) as HTMLCanvasElement;
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);

// Check if webcam access is supported.
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton") as HTMLButtonElement;
    enableWebcamButton.addEventListener("click", enableCam);
} else {
    console.warn("getUserMedia() is not supported by your browser");
}

// Enable the live webcam view and start detection.
function enableCam(event: any) {
    if (!poseLandmarker) {
        console.log("Wait! poseLandmaker not loaded yet.");
        return;
    }

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerText = "ENABLE PREDICTIONS";
    } else {
        webcamRunning = true;
        enableWebcamButton.innerText = "DISABLE PREDICTIONS";
    }

    // getUsermedia parameters.
    const constraints = {
        video: true
    };

    // Activate the webcam stream.
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
    });
}

let lastVideoTime = -1;
async function predictWebcam() {
    canvasElement.style.height = videoHeight;
    video.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.width = videoWidth;
    // Now let's start detecting the stream.
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            canvasCtx?.save();
            canvasCtx?.clearRect(0, 0, canvasElement.width, canvasElement.height);
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
                drawingUtils.drawLandmarks(landmark, {
                    radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1)
                });
                drawingUtils.drawConnectors(landmark,  [
                    {start: 11, end: 12}, // connection between shoulders
                    {start: 11, end: 13}, // connection between left shoulder and elbow
                    {start: 12, end: 14}, // connection between right shoulder and elbow
                    {start: 13, end: 15}, // connection between left elbow and wrist
                    {start: 14, end: 16}, // connection between right elbow and wrist
                    {start: 15, end: 21}, // connection between left wrist and thumb
                    {start: 15, end: 17}, // connection between left wrist and pinky
                    {start: 15, end: 19}, // connection between left wrist and index
                    {start: 16, end: 18}, // connection between right wrist and pinky
                    {start: 16, end: 20}, // connection between right wrist and index
                    {start: 16, end: 22}, // connection between right wrist and thumb
                    {start: 17, end: 19}, // connection between left pinky and index
                    {start: 18, end: 20} // connection between right pinky and index
                ]);
            }
            canvasCtx?.restore();
        });
    }

    // Call this function again to keep predicting when the browser is ready.
    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
