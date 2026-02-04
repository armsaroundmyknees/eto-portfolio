let mainCanvas = document.getElementById("main-canvas");
let mainController = document.getElementById("main-controller");

let frames = [];
let frameIndex = 0;
let boxWidth = 80;
let spacing = boxWidth * 1;

let pageTitle = document.title;

// --- DYNAMIC SETTINGS ---
let baseLifeTime = 400; // LifeTime minimal (saat gerak pelan)
let maxLifeTime = 5000; // LifeTime maksimal (saat gerak cepat/banyak box)
let easing = "none"; // none or size
let boxStrokeWeight = 8;
let boxOverlapSize = 0.5; //=

let birdFrame = { filename: "bird", length: 3, ext: "png" };
let imageLifeTimeSpeed = 0; // Contoh: Gambar hilang 100ms lebih awal
let imageOverlapLifeTimeSpeed = -200;
let playFrames = true; // Jika true, bird akan beranimasi sampai hilang
let animationSpeed = 100; // Kecepatan animasi (dalam ms). 100 = cepat, 300 = lambat
let pauseBoxBefore = true; // Jika true, hanya box terakhir yang beranimasi.

// ------------------------

// record
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

let lastDrawX, lastDrawY;
let isDrawing = false;
let boxes = [];

function preload() {
  for (let i = 1; i <= birdFrame.length; i++) {
    frames.push(
      loadImage(`../images/${birdFrame.filename}-${i}.${birdFrame.ext}`),
    );
  }

  backgroundImage = loadImage("../images/atas-atap.webp");
}

function setup() {
  createCanvas(1920, 1080, mainCanvas);

  pixelDensity(1);
  imageMode(CENTER);
  rectMode(CENTER);

  // ambil stream dari canvas p5
  const stream = document.getElementById("main-canvas").captureStream(60);

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9",
    videoBitsPerSecond: 80_000_000,
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = saveRecording;
}

function spawnBox(x, y) {
  let img = frames[frameIndex];
  let aspectRatio = img.height / img.width;
  let boxHeight = boxWidth * aspectRatio;

  // Tentukan lifetime untuk box ini berdasarkan jumlah box yang sudah ada
  // Semakin banyak antrean, semakin awet box baru ini hidup
  let dynamicLifeTime = map(
    boxes.length,
    0,
    50,
    baseLifeTime,
    maxLifeTime,
    true,
  );

  if (pauseBoxBefore) {
    for (let other of boxes) {
      if (other.isPlaying !== false) {
        // Hitung frame saat ini untuk dikunci
        let ageAtPause = millis() - other.born;
        let frameOffset = floor(ageAtPause / animationSpeed);

        other.frozenFrame = (other.startFrame + frameOffset) % frames.length;
        other.isPlaying = false; // Berhenti beranimasi
      }
    }
  }

  let isOverlapping = false;
  // Hanya cek overlap jika kotak sudah ada di layar
  if (boxes.length > 0) {
    for (let other of boxes) {
      let d = dist(x, y, other.x, other.y);
      // Gunakan variabel boxOverlapSize yang sudah Anda buat
      if (d < boxWidth * boxOverlapSize) {
        isOverlapping = true;
        break;
      }
    }
  }

  boxes.push({
    x,
    y,
    w: boxWidth,
    h: boxHeight,
    jitterW: randomInt(10, 50),
    jitterH: randomInt(1, 100),
    frame: frameIndex, // Tetap simpan ini sebagai backup
    startFrame: frameIndex, // WAJIB: Pastikan baris ini ada
    born: millis(),
    deathDuration: dynamicLifeTime,
    isOverlapped: isOverlapping,
    frozenFrame: null,
    isPlaying: true,
  });
  frameIndex = (frameIndex + 1) % frames.length;
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function draw() {
  background(255);
  push();
  imageMode(CORNER);
  image(
    backgroundImage,
    0,
    -200,
    1920,
    (backgroundImage.height / backgroundImage.width) * 1920,
  );

  pop();
  let currentTime = millis();

  // 1. Clean up menggunakan deathDuration masing-masing box
  while (boxes.length > 0) {
    let age = currentTime - boxes[0].born;
    if (age > boxes[0].deathDuration) {
      boxes.shift();
    } else {
      break;
    }
  }

  if (boxes.length > 0) {
    drawMergedSiluet(currentTime, boxStrokeWeight, color(0));
    drawMergedSiluet(currentTime, 0, color(255));
  }

  // 3. GAMBAR ISI (Frames)
  for (let b of boxes) {
    let age = currentTime - b.born;

    // 1. Pastikan durasi tidak minus (Penyebab utama tidak muncul)
    let imageLifeDuration = b.isOverlapped
      ? 300
      : Math.max(100, b.deathDuration + imageLifeTimeSpeed);

    if (age < imageLifeDuration) {
      // 2. Hitung Progress & Scale
      let imgProgress = constrain(age / imageLifeDuration, 0, 1);
      let scaleVal = 1.0;
      if (easing === "size") {
        if (imgProgress < 0.2)
          scaleVal = easeOutBack(map(imgProgress, 0, 0.2, 0, 1));
        else if (imgProgress > 0.8) scaleVal = map(imgProgress, 0.8, 1, 1, 0);
      }

      // 3. Tentukan Frame (Animasi)
      let currentDisplayFrame;

      // Jika fitur pause dimatikan, SEMUA box yang 'playFrames' akan terus bergerak
      if (playFrames && frames.length > 0) {
        if (!pauseBoxBefore || b.isPlaying) {
          // Box bergerak normal
          let frameOffset = floor(age / animationSpeed);
          currentDisplayFrame = (b.startFrame + frameOffset) % frames.length;
        } else {
          // Box sedang dipause, gunakan frame yang sudah dibekukan
          currentDisplayFrame =
            b.frozenFrame !== null ? b.frozenFrame : b.startFrame;
        }
      } else {
        currentDisplayFrame = b.startFrame;
      }
      // 4. Ambil objek gambar
      let imgToDraw = frames[currentDisplayFrame];

      // 5. Eksekusi Gambar (Hanya jika gambar valid)
      if (imgToDraw) {
        push();
        // Paksa ke BLEND dulu untuk memastikan masalah bukan di blendMode
        blendMode(BLEND);
        image(imgToDraw, b.x, b.y, b.w * scaleVal, b.h * scaleVal);
        pop();
      } else {
        // Jika masih tidak muncul, jalankan ini sekali untuk cek di Console (F12)
        if (frameCount % 60 === 0)
          console.log("Gagal ambil gambar di indeks:", currentDisplayFrame);
      }
    }
  }

  handleInput();
}

function calculateScale(currentTime, b) {
  if (easing === "none") return 1.0;

  let age = currentTime - b.born;
  let progress = age / b.deathDuration; // Gunakan deathDuration unik milik box

  if (progress < 0.2) {
    return easeOutBack(map(progress, 0, 0.2, 0, 1));
  } else if (progress > 0.8) {
    return map(progress, 0.8, 1, 1, 0);
  }
  return 1.0;
}

function drawMergedSiluet(currentTime, offset, col) {
  push();
  noStroke();
  fill(col);

  for (let b of boxes) {
    let scaleVal = calculateScale(currentTime, b);
    let currentW = (b.w + b.jitterW) * scaleVal;
    let currentH = (b.h + b.jitterH) * scaleVal;
    let finalW = currentW + (scaleVal > 0.01 ? offset : 0);
    let finalH = currentH + (scaleVal > 0.01 ? offset : 0);
    rect(b.x, b.y, finalW, finalH);
  }
  pop();
}

function handleInput() {
  if (
    (mouseIsPressed && mouseButton === LEFT) ||
    (keyIsPressed && (key === "e" || key === "E"))
  ) {
    if (!isDrawing) {
      lastDrawX = mouseX;
      lastDrawY = mouseY;
      spawnBox(lastDrawX, lastDrawY);
      isDrawing = true;
    } else {
      let d = dist(lastDrawX, lastDrawY, mouseX, mouseY);
      if (d >= spacing) {
        let angle = atan2(mouseY - lastDrawY, mouseX - lastDrawX);
        let steps = floor(d / spacing);
        for (let i = 1; i <= steps; i++) {
          spawnBox(
            lastDrawX + cos(angle) * spacing * i,
            lastDrawY + sin(angle) * spacing * i,
          );
        }
        lastDrawX = mouseX;
        lastDrawY = mouseY;
      }
    }
  } else {
    isDrawing = false;
  }

  if (key === "R" || key === "r") startRecording();
  if (key === "S" || key === "s") stopRecording();
}

function startRecording() {
  if (isRecording) return; // sudah record → ignore

  recordedChunks = [];
  mediaRecorder.start();
  isRecording = true;

  document.title = "recording / " + pageTitle;

  console.log("Recording started");
}

function stopRecording() {
  if (!isRecording) return; // belum record → ignore

  mediaRecorder.stop();
  isRecording = false;

  document.title = pageTitle;

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
