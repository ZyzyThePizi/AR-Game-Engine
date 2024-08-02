import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';

import { Rectangle } from "./Rectangle";

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
const videoHeight = 540;
const videoWidth = 720;

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
const baseCanvas = document.getElementById(
    "base_canvas"
) as HTMLCanvasElement;
const topCanvas = document.getElementById(
    "top_canvas"
) as HTMLCanvasElement;
const baseCanvasCtx = baseCanvas.getContext("2d");
const topCanvasCtx = baseCanvas.getContext("2d");
const drawingUtils = new DrawingUtils(baseCanvasCtx);

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


let random_Y = Math.random() * videoHeight;
let rectangle = new Rectangle(0, random_Y, "blue", "asd", 1, videoWidth, videoHeight, topCanvasCtx);



let updateRectangle = function () {
    requestAnimationFrame(updateRectangle);
    rectangle.update();
}



let lastVideoTime = -1;
async function predictWebcam() {
    baseCanvas.style.height = videoHeight + "px";
    video.style.height = videoHeight + "px";
    baseCanvas.style.width = videoWidth + "px";
    video.style.width = videoWidth + "px";
    // Now let's start detecting the stream.
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }
    let startTimeMs = performance.now();
    rectangle.draw();
    updateRectangle();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            baseCanvasCtx?.save();
            baseCanvasCtx?.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
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
                drawingUtils.drawLandmarks(landmark,  {
                    radius: 8, // Larger radius for the joints
                    color: 'purple', // Custom color for the joints
                });
            }
            baseCanvasCtx?.restore();
        });
    }

    // Call this function again to keep predicting when the browser is ready.
    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}