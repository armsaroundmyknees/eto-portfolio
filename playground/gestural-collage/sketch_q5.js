// element dom
let mainCanvas = document.getElementById("main-canvas");

// canvas res
let canvasRes = {
  width: 1000,
  height: 1250,
}; // 4:5

// record
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// canvas objects
let webcamVideo;
let scaledWebcam;
let collageItems;
let backgroundOverlay;

let lerpSpeed = 0.1;

// rotated boxes
let numBoxes = 6;
let angle = 0;
let focused = 3;
let currentPos = [];
let images = [];
let boxColors = [];

// ml5js
let handpose;
let hands = [];

let gestureCount = {};
let lastCommittedGesture = -1;
// const GESTURE_THRESHOLD = 5;

// circle formations
let circles = [];
let numCircles = 13;
let currentTargetFormation = 0;
let circleSizes = []; // Menyimpan ukuran tiap index

// Data formasi (x, y) untuk 1-6
let circleFormations = [[], [], [], [], [], [], []];

// config
let colors = {
  blue: "#8dc2d9",
  orange: "#f56042",
  black: "#000000",
  white: "#ffffff",
};

// Ganti beberapa URL dengan string kosong atau link mati untuk tes fallback
let imgUrls = [
  "../images/1.jpg",
  "../images/2.webp",
  "../images/4.webp",
  "../images/6.webp",
  "../images/3.webp",
  "../images/5.webp",
];

function proportionalWidth(originalWidth, originalHeight, targetHeight) {
  return (originalWidth / originalHeight) * targetHeight;
}

function proportionalHeight(originalWidth, originalHeight, targetWidth) {
  return (originalHeight / originalWidth) * targetWidth;
}

Q5.WebGPU();
Q5.experimental = true;

async function setup() {
  pixelDensity(1);

  await createCanvas(
    canvasRes.width,
    canvasRes.height + canvasRes.height / 5,
    mainCanvas,
  );

  let rec = createRecorder();

  // ambil stream dari canvas p5
  const stream = document.getElementById("main-canvas").captureStream(60);

  // mediaRecorder = new MediaRecorder(stream, {
  //   mimeType: "video/webm; codecs=vp9",
  //   videoBitsPerSecond: 40_000_000,
  // });

  // mediaRecorder.ondataavailable = (e) => {
  //   if (e.data.size > 0) recordedChunks.push(e.data);
  // };

  // mediaRecorder.onstop = saveRecording;

  for (let i = 0; i < numBoxes; i++) {
    if (imgUrls[i] && imgUrls[i] !== "") {
      images[i] = loadImage(
        imgUrls[i],
        (loadedImg) => {
          console.log(
            `Gambar ${i + 1} loaded. Ratio: ${loadedImg.width / loadedImg.height}`,
          );
        },
        () => {
          console.log(`Gambar ${i + 1} gagal dimuat, menggunakan fallback.`);
          images[i] = null;
        },
      );
    } else {
      images[i] = null;
    }

    currentPos.push({ x: width / 2, y: height / 2, w: 470, h: 0 });
    boxColors.push(color(random(100, 200), random(100, 200), random(100, 200)));
  }

  // init webcam & ml5 (tetap sama)
  webcamVideo = await createCapture(VIDEO, { flipped: true }, loadML5);
  webcamVideo.size(640, 480);
  webcamVideo.hide();
  scaledWebcam = createGraphics(
    proportionalWidth(webcamVideo.width, webcamVideo.height, canvasRes.height) /
      3.5,
    canvasRes.height / 3.5,
  );
  backgroundOverlay = createGraphics(canvasRes.width, canvasRes.height);
}

async function loadML5() {
  console.log("Load model...");
  handpose = await ml5.handPose({ flipped: true });

  //
  console.log("Model ready...");
}

function gotHands(results) {
  hands = results;
}

// Fungsi untuk membuat formasi tanpa tabrakan

function orbitGallery() {
  let centerX = canvasRes.width / 2;
  let centerY = canvasRes.height / 2.3;
  let radiusX = canvasRes.width * 0.4;
  let radiusY = canvasRes.height * 0.3;
  let baseW = canvasRes.width / 2;

  let orbiters = [];
  for (let i = 0; i < numBoxes; i++) {
    if (i + 1 !== focused) orbiters.push(i);
  }

  for (let i = 0; i < numBoxes; i++) {
    let targetX, targetY, targetSizeW, targetSizeH;
    let index = i + 1;

    // --- LOGIKA RATIO DINAMIS ---
    let currentImg = images[i];
    let imgRatio;

    if (currentImg && currentImg.width > 1) {
      // Menggunakan ratio asli gambar (Height / Width)
      imgRatio = currentImg.height / currentImg.width;
    } else {
      // Fallback ratio 5/4 (1.25)
      imgRatio = 5 / 4;
    }

    if (focused === index) {
      targetSizeW = baseW * 1.1;
      targetSizeH = targetSizeW * imgRatio; // Mengikuti ratio asli
      targetX = centerX - 30;
      targetY = centerY - 100;
    } else {
      let orbitIndex = orbiters.indexOf(i);
      let totalOrbiters = orbiters.length;
      let currentAngle = angle + (TWO_PI / totalOrbiters) * orbitIndex;

      targetX = centerX + cos(currentAngle) * radiusX;
      targetY = centerY + sin(currentAngle) * radiusY;

      if (currentImg.width > currentImg.height) {
        targetSizeW = baseW * 0.78;
        targetSizeH = targetSizeW * imgRatio; // Mengikuti ratio asli
      } else {
        targetSizeW = baseW * 0.5;
        targetSizeH = targetSizeW * imgRatio; // Mengikuti ratio asli
      }
    }

    currentPos[i].x = lerp(currentPos[i].x, targetX, lerpSpeed);
    currentPos[i].y = lerp(currentPos[i].y, targetY, lerpSpeed);
    currentPos[i].w = lerp(currentPos[i].w, targetSizeW, lerpSpeed);
    currentPos[i].h = lerp(currentPos[i].h, targetSizeH, lerpSpeed);
  }

  // Render (tetap sama)
  pushMatrix();
  // translate(-50, -50);
  //
  translate(10 + sin(frameCount * 0.05) * 10, 10 + cos(frameCount * 0.05) * 10);

  for (let idx of orbiters) drawItem(idx);
  if (focused !== 0) drawItem(focused - 1);

  popMatrix();

  angle += 0.009;
}

async function draw() {
  background(colors.black);

  pushMatrix();
  translate((canvasRes.width / 2) * -1, -canvasRes.height / 2);
  // scale(1);
  //
  //

  fill(colors.blue);
  noStroke();
  rect(0, 0, canvasRes.width, canvasRes.height);

  if (isRecording) {
    //
    pushMatrix();
    noStroke();
    fill(255, 0, 0);
    ellipse(30, -(canvasRes.height / 10 - 30), 10, 10);
    popMatrix();
  }

  // image(circlesCanvas, 0, 0);

  pushMatrix();
  // clip(() => {
  //   rect(0, 0, canvasRes.width, canvasRes.height);
  // });
  scaledWebcam.background(colors.blue);
  pushMatrix();
  scaledWebcam.image(
    webcamVideo,
    0,
    0,
    proportionalWidth(webcamVideo.width, webcamVideo.height, canvasRes.height) /
      3.5,
    canvasRes.height / 3.5,
  );

  // scaled webcam in canvas
  pushMatrix();
  translate(
    canvasRes.width - scaledWebcam.width,
    canvasRes.height - scaledWebcam.height - scaledWebcam.height / 6,
  );
  translate(0, 10 + cos(frameCount * 0.05) * 10);
  image(scaledWebcam, 0, 0);
  // blendMode(SCREEN);
  // fill(colors.orange);
  noFill();
  noStroke();
  rect(
    0,
    0,
    proportionalWidth(webcamVideo.width, webcamVideo.height, canvasRes.height) /
      3.5,
    canvasRes.height / 3.5,
  );
  blendMode(BLEND);
  popMatrix();

  popMatrix();

  // blendMode(SCREEN);

  // 4. Gambar warna overlay (bisa langsung atau pakai layer)
  // Jika hanya ingin warna biru solid dengan efek SCREEN:
  // fill(colors.blue);
  // noStroke();
  // rect(0, 0, canvasRes.width, canvasRes.height);

  // 5. KEMBALIKAN KE NORMAL
  // blendMode(BLEND);

  popMatrix();

  orbitGallery();
  if (hands.length > 0) detectGesture(hands[0]);
  // mainCanvas.style = "height: 90dvh; width: auto;";
  //
  pushMatrix();

  popMatrix();
}

function drawItem(index) {
  let img = images[index];
  let pos = currentPos[index];

  pushMatrix();
  rectMode(CENTER);
  imageMode(CENTER);
  translate(pos.x, pos.y);

  if (img && img.width > 1) {
    // Karena targetSizeH sudah mengikuti ratio gambar,
    // kita bisa langsung gambar tanpa clipping manual yang rumit
    image(img, 0, 0, pos.w, pos.h);

    noFill();
    stroke(0);
    rect(0, 0, pos.w, pos.h);
  } else {
    // FALLBACK
    fill(boxColors[index]);
    stroke(0);
    strokeWeight(2);
    rect(0, 0, pos.w, pos.h);
  }
  popMatrix();
}

function keyPressed() {
  let num = parseInt(key);

  // 1. Logika untuk Focus Gallery (1-6)
  if (!isNaN(num) && num > 0 && num <= numBoxes) {
    focused = focused === num ? 0 : num;
  } else if (key === "0") {
    focused = 0;
  }

  // 2. Logika untuk Formasi Lingkaran (Hanya jika angka 1-6)
  // Ini mencegah currentTargetFormation menjadi negatif atau di luar batas array
  if (num >= 2 && num <= 6) {
    currentTargetFormation = num - 1;
  } else if (key === "0" || key === "1") {
    currentTargetFormation = 0; // Kembalikan ke formasi awal jika tekan 0
  }

  if (key === "R" || key === "r") startRecording();
  if (key === "S" || key === "s") stopRecording();

  if (key == "Z" || key === "z") {
    handpose.detectStart(webcamVideo, gotHands);
  }

  if (key == "X" || key === "x") {
    handpose.detectStop();
  }
}

// function detectGesture(hand) {
//   const p = hand.keypoints;
//   if (!p) return;

//   let wrist = p[0];

//   // ===============================
//   // DETEKSI JARI (STABIL)
//   // ===============================
//   let indexUp =
//     dist(p[8].x, p[8].y, wrist.x, wrist.y) >
//     dist(p[6].x, p[6].y, wrist.x, wrist.y);
//   let middleUp =
//     dist(p[12].x, p[12].y, wrist.x, wrist.y) >
//     dist(p[10].x, p[10].y, wrist.x, wrist.y);
//   let ringUp =
//     dist(p[16].x, p[16].y, wrist.x, wrist.y) >
//     dist(p[14].x, p[14].y, wrist.x, wrist.y);
//   let pinkyUp =
//     dist(p[20].x, p[20].y, wrist.x, wrist.y) >
//     dist(p[18].x, p[18].y, wrist.x, wrist.y);

//   // ===============================
//   // DETEKSI JEMPOL (KHUSUS FOTO)
//   // ===============================
//   let thumbTip = p[4];
//   let indexMCP = p[5];

//   let thumbUp = abs(thumbTip.x - indexMCP.x) > 70 && thumbTip.y < wrist.y + 40;

//   // ===============================
//   // KLASIFIKASI GESTUR (1–6)
//   // ===============================
//   let gesture = -1;

//   if (indexUp && middleUp && ringUp && pinkyUp && thumbUp) {
//     gesture = 5;
//   } else if (indexUp && middleUp && ringUp && pinkyUp && !thumbUp) {
//     gesture = 4;
//   } else if (indexUp && middleUp && ringUp && !pinkyUp && !thumbUp) {
//     gesture = 3;
//   } else if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbUp) {
//     gesture = 2;
//   } else if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
//     gesture = 1;
//   } else if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
//     gesture = 6;
//   } else if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
//     gesture = 0;
//   }

//   if (gesture !== -1) {
//     console.log(gesture);
//     focused = gesture;
//     currentTargetFormation = int(gesture);
//   }
// }
//
//

// --- VARIABEL GLOBAL UNTUK STABILISASI ---
let lastGestureCandidate = -1; // Gestur yang sedang dideteksi sementara
let consistentFrameCount = 1; // Hitungan berapa lama gestur itu bertahan
const GESTURE_THRESHOLD = 7; // Berapa frame harus konsisten (misal: 10 frame = ~0.16 detik di 60fps)

// function detectGesture(hand) {
//   const p = hand.keypoints;
//   if (!p) return;

//   let wrist = p[0];

//   // ===============================
//   // DETEKSI JARI (TETAP)
//   // ===============================
//   let indexUp =
//     dist(p[8].x, p[8].y, wrist.x, wrist.y) >
//     dist(p[6].x, p[6].y, wrist.x, wrist.y);
//   let middleUp =
//     dist(p[12].x, p[12].y, wrist.x, wrist.y) >
//     dist(p[10].x, p[10].y, wrist.x, wrist.y);
//   let ringUp =
//     dist(p[16].x, p[16].y, wrist.x, wrist.y) >
//     dist(p[14].x, p[14].y, wrist.x, wrist.y);
//   let pinkyUp =
//     dist(p[20].x, p[20].y, wrist.x, wrist.y) >
//     dist(p[18].x, p[18].y, wrist.x, wrist.y);

//   // ===============================
//   // DETEKSI JEMPOL (DIPERBAIKI)
//   // ===============================
//   let thumbTip = p[4];
//   let indexMCP = p[5];

//   // Rumus Baru:
//   // Kita hitung dulu seberapa besar tangannya (jarak Wrist ke Pangkal Telunjuk)
//   let handSize = dist(wrist.x, wrist.y, indexMCP.x, indexMCP.y);

//   // Jempol dianggap "Up" jika jarak ujung jempol ke pangkal telunjuk
//   // lebih besar dari 70% ukuran tangan tersebut.
//   let thumbUp =
//     dist(thumbTip.x, thumbTip.y, indexMCP.x, indexMCP.y) > handSize * 0.7;

//   // ===============================
//   // KLASIFIKASI GESTUR (TETAP)
//   // ===============================
//   let gesture = -1;

//   if (indexUp && middleUp && ringUp && pinkyUp && thumbUp) {
//     gesture = 5;
//   } else if (indexUp && middleUp && ringUp && pinkyUp && !thumbUp) {
//     gesture = 4;
//   } else if (indexUp && middleUp && ringUp && !pinkyUp && !thumbUp) {
//     gesture = 3;
//   } else if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbUp) {
//     gesture = 2;
//   } else if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
//     gesture = 1;
//   } else if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
//     gesture = 6;
//   } else if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
//     gesture = 0;
//   }

//   if (gesture !== -1) {
//     console.log(gesture);
//     focused = gesture;
//     // currentTargetFormation = int(gesture);
//   }

//   return gesture;
// }

function detectGesture(hand) {
  const p = hand.keypoints;
  if (!p) return;

  let wrist = p[0];

  // ===============================
  // DETEKSI JARI (TETAP)
  // ===============================
  let indexUp =
    dist(p[8].x, p[8].y, wrist.x, wrist.y) >
    dist(p[6].x, p[6].y, wrist.x, wrist.y);
  let middleUp =
    dist(p[12].x, p[12].y, wrist.x, wrist.y) >
    dist(p[10].x, p[10].y, wrist.x, wrist.y);
  let ringUp =
    dist(p[16].x, p[16].y, wrist.x, wrist.y) >
    dist(p[14].x, p[14].y, wrist.x, wrist.y);
  let pinkyUp =
    dist(p[20].x, p[20].y, wrist.x, wrist.y) >
    dist(p[18].x, p[18].y, wrist.x, wrist.y);

  // ===============================
  // DETEKSI JEMPOL (TETAP)
  // ===============================
  let thumbTip = p[4];
  let indexMCP = p[5];
  let handSize = dist(wrist.x, wrist.y, indexMCP.x, indexMCP.y);
  let thumbUp =
    dist(thumbTip.x, thumbTip.y, indexMCP.x, indexMCP.y) > handSize * 0.7;

  // ===============================
  // KLASIFIKASI GESTUR MENTAH
  // ===============================
  let currentGesture = -1; // Ganti nama variable local biar tidak rancu

  if (indexUp && middleUp && ringUp && pinkyUp && thumbUp) {
    currentGesture = 5;
  } else if (indexUp && middleUp && ringUp && pinkyUp && !thumbUp) {
    currentGesture = 4;
  } else if (indexUp && middleUp && ringUp && !pinkyUp && !thumbUp) {
    currentGesture = 3;
  } else if (indexUp && middleUp && !ringUp && !pinkyUp && !thumbUp) {
    currentGesture = 2;
  } else if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
    currentGesture = 1;
  } else if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
    currentGesture = 6;
  } else if (!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
    currentGesture = 0;
  }

  // ===============================
  // LOGIKA STABILISASI (ANTI-FLICKER)
  // ===============================
  if (currentGesture !== -1) {
    // Jika gestur saat ini SAMA dengan calon gestur sebelumnya
    if (currentGesture === lastGestureCandidate) {
      consistentFrameCount++; // Tambah counter kepercayaan
    } else {
      // Jika gestur berubah, reset counter dan ganti kandidat
      lastGestureCandidate = currentGesture;
      consistentFrameCount = 0;
    }

    // Jika sudah konsisten selama X frame, baru update variabel utama
    if (consistentFrameCount > GESTURE_THRESHOLD) {
      // Cek agar tidak spam console log jika nilainya sudah sama
      if (focused !== currentGesture) {
        focused = currentGesture;
        console.log("Gesture Locked:", focused);
      }
      // Reset counter supaya tidak overflow (opsional, tapi aman)
      // consistentFrameCount = GESTURE_THRESHOLD;
    }
  }

  // return focused; // Return gestur yang sudah stabil, bukan yang mentah
}

function startRecording() {
  if (isRecording) return; // sudah record → ignore

  recordedChunks = [];
  mediaRecorder.start();
  isRecording = true;

  console.log("Recording started");
}

function stopRecording() {
  if (!isRecording) return; // belum record → ignore

  mediaRecorder.stop();
  isRecording = false;

  console.log("Recording stopped");
}

function saveRecording() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `recording-${Date.now()}.webm`;
  a.click();

  URL.revokeObjectURL(url);
}
