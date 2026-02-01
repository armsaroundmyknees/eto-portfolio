//-- initializing Q5
let webGPUMode = false;
let initialResolution = { width: 1080, height: 1350 }; // artwork size before webcam and spacer
let artworkCanvas;

//-- q5 webcam
let webcamHeightSpacer = 20;
let webcamHeightPlus = 50;
let webcamReferences;
let webcamPosition = "TOP";
let webcamBuffer;

//--- dom
let noticeBlock = document.getElementById("main-notice");
let noticePreloadStats = noticeBlock.querySelector("#loading-status-notice");
let pageTitle = document.title;
let mainCanvas = document.getElementById("main-canvas");
let mainController = document.getElementById("main-controller");
let popupController = null;
let recordElement;

//-- q5 draw
let strokeWeightSize = 5;
let backgroundImage;

//----  q5 -> ml5 config
let handPose;
let hands = [];

//--- q5 bg + dom bg
let backgroundColor = "#dddddd";
document.body.style.backgroundColor = backgroundColor;

initQ5();

async function initQ5() {
  if (!webGPUMode) {
    function preDrawTransform() {
      _mouseX = mouseX;
      _mouseY = mouseY;

      // override ke world-space
      window.mouseX = _mouseX - width / 2;
      window.mouseY = _mouseY - height / 2;
    }

    function postDrawTransform() {
      // balikin ke nilai asli (biar event p5 gak rusak)
      window.mouseX = _mouseX;
      window.mouseY = _mouseY;
    }

    const _draw = window.draw;
    window.draw = function () {
      resetMatrix();
      translate(width / 2, height / 2);

      preDrawTransform();
      _draw();
      postDrawTransform();
    };
  } else {
    await Q5.WebGPU();
    Q5.experimental = true;
    // start writing webGPU shader here...
    //======================================
  }
}

//======================================
// fix kode webGPU coordinate system ke canvas2d coord system
//======================================
let _mouseX, _mouseY;

function cssToRGBA(css) {
  const m = css
    .match(/rgba?\(([^)]+)\)/)[1]
    .split(",")
    .map((v) => parseFloat(v));

  return [m[0] / 255, m[1] / 255, m[2] / 255, m[3] ?? 1];
}

// --- NAMESPACE: popTrailMotion ---
window.popTrailMotion = {
  boxes: [],
  activeEmitters: [], // Melacak "Kepala" yang sedang terbang
  frameIndex: 0,
  usedConfig: "butterfly",

  configs: {
    butterfly: {
      frames: [],
      frameData: { filename: "bird", length: 6, ext: "png" }, // Pakai bird sebagai contoh
      boxWidth: 60,
      spacing: 40,
      baseLifeTime: 1000,
      maxLifeTime: 6000,
      boxStrokeWeight: 10,
      boxStrokeColor: "#000000",
      boxFillColor: "#ffffff",
      imageLifeTimeDelay: -800,
      animationSpeed: 150,
      boxOverlapSize: 0.3,
      pauseBoxBefore: false,
      easing: "size", // Tambahan khusus popTrail
      moveSpeed: 2, // Kecepatan terbang
      noiseScale: 0.03, //0.005, // Kelenturan belokan (semakin kecil semakin lurus)
      shortcut: "4",
    },
    butterfly2: {
      frames: [],
      frameData: { filename: "bird", length: 6, ext: "png" }, // Pakai bird sebagai contoh
      boxWidth: 60,
      spacing: 40,
      baseLifeTime: 1000,
      maxLifeTime: 6000,
      boxStrokeWeight: 10,
      boxStrokeColor: "#000000",
      boxFillColor: "#dddddd",
      imageLifeTimeDelay: -800,
      animationSpeed: 150,
      boxOverlapSize: 0.3,
      pauseBoxBefore: false,
      easing: "size", // Tambahan khusus popTrail
      moveSpeed: 2, // Kecepatan terbang
      noiseScale: 0.03, //0.005, // Kelenturan belokan (semakin kecil semakin lurus)
      shortcut: "5",
    },
    butterfly3: {
      frames: [],
      frameData: { filename: "bird", length: 6, ext: "png" }, // Pakai bird sebagai contoh
      boxWidth: 60,
      spacing: 40,
      baseLifeTime: 1000,
      maxLifeTime: 6000,
      boxStrokeWeight: 10,
      boxStrokeColor: "#000000",
      boxFillColor: "#e8da99",
      imageLifeTimeDelay: -800,
      animationSpeed: 150,
      boxOverlapSize: 0.3,
      pauseBoxBefore: false,
      easing: "size", // Tambahan khusus popTrail
      moveSpeed: 2, // Kecepatan terbang
      noiseScale: 0.03, //0.005, // Kelenturan belokan (semakin kecil semakin lurus)
      shortcut: "6",
    },
  }, // Fungsi untuk memicu kemunculan baru (Panggil ini dari handleInput)

  trigger: function (confName) {
    let conf = this.configs[confName];
    this.activeEmitters.push({
      x: random(width),
      y: random(height),
      conf: conf,
      offSetX: random(1000), // Seed unik untuk perlin noise X
      offSetY: random(1000), // Seed unik untuk perlin noise Y
      lastSpawnX: -999,
      lastSpawnY: -999,
    });
  },

  update: function (currentTime) {
    // 1. Update Emitters (Kepala yang terbang)
    for (let i = this.activeEmitters.length - 1; i >= 0; i--) {
      let e = this.activeEmitters[i]; // Hitung pergerakan kupu-kupu dengan Perlin Noise

      let angle = noise(e.offSetX, e.offSetY, currentTime * 0.001) * TWO_PI * 2;
      e.x += cos(angle) * e.conf.moveSpeed;
      e.y += sin(angle) * e.conf.moveSpeed; // Update seed noise agar terus bergerak

      e.offSetX += e.conf.noiseScale;
      e.offSetY += e.conf.noiseScale; // Logika Spawn Jejak (Trail)

      let d = dist(e.x, e.y, e.lastSpawnX, e.lastSpawnY);
      if (d >= e.conf.spacing) {
        this.spawnBox(e.x, e.y, e.conf);
        e.lastSpawnX = e.x;
        e.lastSpawnY = e.y;
      } // Hapus emitter jika keluar canvas

      if (e.x < -100 || e.x > width + 100 || e.y < -100 || e.y > height + 100) {
        this.activeEmitters.splice(i, 1);
      }
    } // 2. Update Boxes (Pembersihan box yang sudah mati)

    while (
      this.boxes.length > 0 &&
      currentTime - this.boxes[0].born > this.boxes[0].deathDuration
    ) {
      this.boxes.shift();
    }
  },

  draw: function (currentTime) {
    if (this.boxes.length === 0) return;
    this.drawSilhouettes(currentTime);

    for (let b of this.boxes) {
      let age = currentTime - b.born;
      let imageLifeDuration = b.isOverlapped
        ? 300
        : Math.max(100, b.deathDuration + (b.conf.imageLifeTimeDelay || 0));

      if (age < imageLifeDuration) {
        let scaleVal = this.calculateScale(
          age,
          imageLifeDuration,
          b.conf.easing,
        );
        let frameIdx = this.getAnimationFrame(b, age);
        let imgToDraw = b.conf.frames[frameIdx];

        if (imgToDraw) {
          push();
          imageMode(CENTER);
          image(imgToDraw, b.x, b.y, b.w * scaleVal, b.h * scaleVal);
          pop();
        }
      }
    }
  }, // --- Reuse Logika dari trailBrushMotion ---

  drawSilhouettes: function (currentTime) {
    this.renderRects(currentTime, "stroke");
    this.renderRects(currentTime, "fill");
  },

  renderRects: function (currentTime, type) {
    push();
    rectMode(CENTER);
    noStroke(); // Cache millis untuk mengurangi pemanggilan fungsi di dalam loop

    let currentMillis = millis();

    for (let b of this.boxes) {
      let age = currentTime - b.born;
      let scaleVal = this.calculateScale(age, b.deathDuration, b.conf.easing); // Gunakan variabel lokal daripada berkali-kali akses objek/property

      let bConf = b.conf;
      let offset = type === "stroke" ? bConf.boxStrokeWeight || 8 : 0;
      let col = type === "stroke" ? bConf.boxStrokeColor : bConf.boxFillColor;

      fill(col); // Hitung boiling hanya sekali

      let boil = sin(currentMillis * 0.01 + b.born) * 5;

      rect(
        b.x,
        b.y,
        (b.w + b.jitterW + boil) * scaleVal + offset,
        (b.h + b.jitterH + boil) * scaleVal + offset,
      );
    }
    pop();
  },

  spawnBox: function (x, y, conf) {
    let img = conf.frames[this.frameIndex % conf.frames.length];
    if (!img) return;
    let aspectRatio = img.height / img.width;
    this.boxes.push({
      x,
      y,
      w: conf.boxWidth,
      h: conf.boxWidth * aspectRatio,
      conf,
      jitterW: random(10, 50),
      jitterH: random(1, 100),
      startFrame: this.frameIndex % conf.frames.length,
      born: millis(),
      deathDuration: map(
        this.boxes.length,
        0,
        50,
        conf.baseLifeTime,
        conf.maxLifeTime,
        true,
      ),
      isOverlapped: this.checkOverlap(x, y, conf),
      frozenFrame: null,
      isPlaying: true,
    });
    this.frameIndex++;
  },

  checkOverlap: function (x, y, conf) {
    return this.boxes.some(
      (b) => dist(x, y, b.x, b.y) < conf.boxWidth * conf.boxOverlapSize,
    );
  },

  calculateScale: function (age, duration, easingType) {
    if (easingType === "none") return 1.0;
    let progress = age / duration;
    if (progress < 0.2)
      return this.utils.easeOutBack(map(progress, 0, 0.2, 0, 1));
    if (progress > 0.8) return map(progress, 0.8, 1, 1, 0);
    return 1.0;
  },

  getAnimationFrame: function (b, age) {
    if (!b.conf.pauseBoxBefore || b.isPlaying) {
      return (
        (b.startFrame + floor(age / b.conf.animationSpeed)) %
        b.conf.frames.length
      );
    }
    return b.frozenFrame !== null ? b.frozenFrame : b.startFrame;
  },

  utils: {
    easeOutBack: (x) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    },
  },
};

// --- NAMESPACE: trailBrushMotion ---
// Semua variabel dan fungsi terkait animasi box/trail dibungkus di sini
window.trailBrushMotion = {
  boxes: [],
  frameIndex: 0,
  lastDrawX: null,
  lastDrawY: null,
  isDrawing: false, // Konfigurasi Preset dalam Motion ini
  usedConfig: "bird",

  configs: {
    bird: {
      frames: [],
      frameData: { filename: "bird", length: 6, ext: "png" },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 200,
      maxLifeTime: 6000,
      boxStrokeWeight: 8,
      boxStrokeColor: "#000000",
      boxFillColor: "#e8da99",
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "none",
      shortcut: "1",
    },
    bird2: {
      frames: [],
      frameData: { filename: "bird", length: 6, ext: "png" },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 400,
      maxLifeTime: 6000,
      boxStrokeWeight: 0,
      boxStrokeColor: cssToRGBA("rgba(255,255,255,0)"),
      boxFillColor: cssToRGBA("rgba(255,255,255,0)"),
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "none",
      shortcut: "2",
    },
    letter: {
      frames: [],
      frameData: { filename: "frame", length: 8, ext: "png" },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 400,
      maxLifeTime: 5000,
      boxStrokeWeight: 10,
      boxStrokeColor: "#000000",
      boxFillColor: "white",
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "size",
      shortcut: "3",
    }, // Kamu bisa tambah preset lain khusus untuk trailBrushMotion di sini
  }, // Method Utama untuk Siklus Hidup
  update: function (currentTime) {
    while (
      this.boxes.length > 0 &&
      currentTime - this.boxes[0].born > this.boxes[0].deathDuration
    ) {
      this.boxes.shift();
    }
  },

  draw: function (currentTime) {
    if (this.boxes.length === 0) return; // 1. Layer Siluet (Menggunakan warna dari config)

    this.drawSilhouettes(currentTime); // 2. Layer Image (Dengan perhitungan LifeTimeDelay)

    for (let b of this.boxes) {
      let age = currentTime - b.born; // Hitung durasi hidup gambar secara spesifik

      let imageLifeDuration = b.isOverlapped
        ? 300
        : Math.max(100, b.deathDuration + (b.conf.imageLifeTimeDelay || 0));

      if (age < imageLifeDuration) {
        // Hitung scale berdasarkan durasi gambar (bukan durasi box) agar easing sinkron
        let scaleVal = this.calculateScale(
          age,
          imageLifeDuration,
          b.conf.easing,
        );
        let frameIdx = this.getAnimationFrame(b, age);
        let imgToDraw = b.conf.frames[frameIdx];

        if (imgToDraw) {
          push();
          imageMode(CENTER);
          image(imgToDraw, b.x, b.y, b.w * scaleVal, b.h * scaleVal);
          pop();
        }
      }
    }
  },

  drawSilhouettes: function (currentTime) {
    // Layer Belakang (Stroke) - Menggunakan boxStrokeColor
    this.renderRects(currentTime, "stroke"); // Layer Depan (Fill) - Menggunakan boxFillColor
    this.renderRects(currentTime, "fill");
  },

  renderRects: function (currentTime, type) {
    push();
    rectMode(CENTER);
    noStroke(); // Cache millis untuk mengurangi pemanggilan fungsi di dalam loop

    let currentMillis = millis();

    for (let b of this.boxes) {
      let age = currentTime - b.born;
      let scaleVal = this.calculateScale(age, b.deathDuration, b.conf.easing); // Gunakan variabel lokal daripada berkali-kali akses objek/property

      let bConf = b.conf;
      let offset = type === "stroke" ? bConf.boxStrokeWeight || 8 : 0;
      let col = type === "stroke" ? bConf.boxStrokeColor : bConf.boxFillColor;

      fill(col); // Hitung boiling hanya sekali

      let boil = sin(currentMillis * 0.01 + b.born) * 5;

      rect(
        b.x,
        b.y,
        (b.w + b.jitterW + boil) * scaleVal + offset,
        (b.h + b.jitterH + boil) * scaleVal + offset,
      );
    }
    pop();
  },

  spawnBox: function (x, y, conf) {
    let img = conf.frames[this.frameIndex % conf.frames.length];
    if (!img) return;

    let aspectRatio = img.height / img.width;
    let baseW = conf.boxWidth;
    let baseH = baseW * aspectRatio;

    let dynamicLifeTime = map(
      this.boxes.length,
      0,
      50,
      conf.baseLifeTime,
      conf.maxLifeTime,
      true,
    );

    if (conf.pauseBoxBefore) this.freezePrevious(conf);

    this.boxes.push({
      x: x,
      y: y,
      w: baseW,
      h: baseH,
      conf: conf, // Referensi ke config yang berisi warna dan delay
      jitterW: random(10, 50),
      jitterH: random(1, 100),
      startFrame: this.frameIndex % conf.frames.length,
      born: millis(),
      deathDuration: dynamicLifeTime,
      isOverlapped: this.checkOverlap(x, y, conf),
      frozenFrame: null,
      isPlaying: true,
    });
    this.frameIndex++;
  },

  freezePrevious: function (conf) {
    for (let b of this.boxes) {
      if (b.isPlaying) {
        let age = millis() - b.born;
        b.frozenFrame =
          (b.startFrame + floor(age / conf.animationSpeed)) %
          b.conf.frames.length;
        b.isPlaying = false;
      }
    }
  },

  checkOverlap: function (x, y, conf) {
    return this.boxes.some(
      (b) => dist(x, y, b.x, b.y) < conf.boxWidth * conf.boxOverlapSize,
    );
  }, // Perubahan: Menerima durasi spesifik agar bisa fleksibel antara box vs image

  calculateScale: function (age, duration, easingType) {
    if (easingType === "none") return 1.0;

    let progress = age / duration;
    if (progress < 0.2)
      return this.utils.easeOutBack(map(progress, 0, 0.2, 0, 1));
    if (progress > 0.8) return map(progress, 0.8, 1, 1, 0);
    return 1.0;
  },

  getAnimationFrame: function (b, age) {
    if (!b.conf.pauseBoxBefore || b.isPlaying) {
      return (
        (b.startFrame + floor(age / b.conf.animationSpeed)) %
        b.conf.frames.length
      );
    }
    return b.frozenFrame !== null ? b.frozenFrame : b.startFrame;
  },

  utils: {
    easeOutBack: (x) => {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    },
  },
};

function gotHands(results) {
  // Save the output to the hands variable
  hands = results;
  // console.log(hands);
}

async function setup() {
  //------ artwork canvas setup
  noLoop();

  artworkCanvas = createCanvas(
    initialResolution.width,
    initialResolution.height,
  );
  artworkCanvas.parent(mainCanvas);

  //----- setup webcam
  webcamReferences = await createCapture(
    {
      video: {
        width: initialResolution.width,
        aspectRatio: 16 / 9,
      },
    },
    { flipped: true },
  );

  await webcamReferences.hide();

  resizeCanvas(
    artworkCanvas.width,
    artworkCanvas.height +
      webcamReferences.height +
      webcamHeightPlus +
      webcamHeightSpacer,
  );

  //----- artwork canvas (DOM) dynamic resize view
  if (artworkCanvas.width > artworkCanvas.height) {
    artworkCanvas.style.width = "80dvw";
    artworkCanvas.style.height = "auto";
  } else {
    artworkCanvas.style.width = "auto";
    artworkCanvas.style.height = "95dvh";
  }

  artworkCanvas.style.borderRadius = "50px";
  artworkCanvas.style.border = "2px solid #666666";

  // setelah akses kamera selesai
  noticeBlock.querySelector(
    "#loading-status-notice",
  ).childNodes[0].textContent = "waiting for machine learning (ml5)";

  handPose = await ml5.handPose({ flipped: true }, () => {
    console.log("handpose ready");
  });

  // setelah ml5.js berhasil diload
  noticeBlock.querySelector(
    "#loading-status-notice",
  ).childNodes[0].textContent = "waiting for hand detection)";

  // detect handpose here
  await handPose.detectStart(webcamReferences, gotHands);

  // setelah handPose berhasil diload
  noticeBlock.querySelector(
    "#loading-status-notice",
  ).childNodes[0].textContent = "all set";

  // tunggu 2 detik
  noticeBlock.classList.add("hide");

  // console.log("height:", webcamReferences.height);

  // webcamReferences.elt.onloadedmetadata = () => {
  //   console.log("video ready");
  //   console.log("width:", webcamReferences.width);
  //   console.log("height:", webcamReferences.height);

  //   // // kalau mau resize canvas
  //   // resizeCanvas(cam.width, cam.height);
  // };

  backgroundImage = loadImage("../images/bg_1080_1350.png"); // Load frames untuk semua preset di dalam trailBrushMotion

  //----- all canvas configuration
  imageMode(CENTER);
  rectMode(CENTER);
  ellipseMode(CENTER);

  loop();

  // 1. Load frames untuk trailBrushMotion (PENTING!)
  for (let key in trailBrushMotion.configs) {
    let conf = trailBrushMotion.configs[key];

    for (let i = 1; i <= conf.frameData.length; i++) {
      conf.frames.push(
        loadImage(
          `../images/${conf.frameData.filename}-${i}.${conf.frameData.ext}`,
        ),
      );
    }

    // recorderInstance = await createRecorder();
    // recorderInstance.style.display = "none";
  }

  // 2. Load frames untuk popTrailMotion (PENTING!)

  for (let key in popTrailMotion.configs) {
    let conf = popTrailMotion.configs[key];
    conf.frames = []; // Pastikan array kosong sebelum push
    for (let i = 1; i <= conf.frameData.length; i++) {
      conf.frames.push(
        loadImage(
          `../images/${conf.frameData.filename}-${i}.${conf.frameData.ext}`,
        ),
      );
    }
  }

  // pixelDensity(1);
  //
  //
  //

  recorderInstance = await createRecorder();
  recorderInstance.style.display = "none";
}

function drawWebcamCover(
  video,
  x,
  y,
  tw = initialResolution.width,
  th = webcamReferences.height + webcamHeightPlus,
) {
  if (!video || video.width === 0) return;

  // abaikan portrait
  if (video.width < video.height) return;

  const srcRatio = video.width / video.height;
  const dstRatio = tw / th;

  let sx = 0,
    sy = 0,
    sw = video.width,
    sh = video.height;

  if (srcRatio > dstRatio) {
    // source terlalu lebar → crop kiri-kanan
    sw = video.height * dstRatio;
    sx = (video.width - sw) * 0.5;
  } else {
    // source terlalu tinggi → crop atas-bawah
    sh = video.width / dstRatio;
    sy = (video.height - sh) * 0.5;
  }

  image(video, x, y, tw, th, sx, sy, sw, sh);
}

// ==========================================
// REPLACE YOUR EXISTING draw() FUNCTION
// ==========================================

function draw() {
  background(backgroundColor);

  // frameRate(60);

  // document.title = "FPS: " + getFPS() + " / " + pageTitle;

  // ==========================================================
  // 1. DYNAMIC LAYOUT CALCULATION (MENTOK EDGE VERSION)
  // ==========================================================

  let videoDrawY; // Titik tengah Y untuk Webcam
  let artworkDrawY; // Titik tengah Y untuk Artwork

  // Kita pakai variabel 'height' bawaan p5 (Total Tinggi Canvas saat ini)
  // Koordinat 0,0 adalah tengah canvas.
  // Tepi Atas  = -height / 2
  // Tepi Bawah =  height / 2

  let canvasTopEdge = -height / 2;
  let canvasBottomEdge = height / 2;

  let halfWebcamH = (webcamReferences.height + webcamHeightPlus) / 2;
  let halfArtH = initialResolution.height / 2;

  if (webcamPosition === "TOP") {
    // --- MODE: WEBCAM DI ATAS ---

    // 1. Webcam MENTOK ATAS
    // Rumus: Tepi Atas + Setengah Tinggi Webcam
    videoDrawY = canvasTopEdge + halfWebcamH;

    // 2. Artwork MENTOK BAWAH
    // Rumus: Tepi Bawah - Setengah Tinggi Artwork
    artworkDrawY = canvasBottomEdge - halfArtH;

    // Hasil: Spacer otomatis tercipta di tengah karena:
    // TotalHeight = WebH + ArtH + Spacer
  } else {
    // --- MODE: WEBCAM DI BAWAH ---

    // 1. Webcam MENTOK BAWAH
    // Rumus: Tepi Bawah - Setengah Tinggi Webcam
    videoDrawY = canvasBottomEdge - halfWebcamH;

    // 2. Artwork MENTOK ATAS
    // Rumus: Tepi Atas + Setengah Tinggi Artwork
    artworkDrawY = canvasTopEdge + halfArtH;
  }
  // ==========================================================
  // 2. DRAW ARTWORK DEBUG (Opsional / Background layer)
  // ==========================================================
  push();
  fill("#ccdde8");
  // stroke("white");
  // strokeWeight(10);
  noStroke();
  rect(0, artworkDrawY, initialResolution.width, initialResolution.height);
  // drawBackground(artworkDrawY);
  pop();

  // ==========================================================
  // 3. DRAW WEBCAM & ROI
  // ==========================================================

  // A. Gambar Webcam Feed sesuai posisi dinamis
  push();
  // shader(monotoneShader);
  //

  drawWebcamCover(webcamReferences, 0, videoDrawY);

  // image(
  //   webcamReferences,
  //   0,
  //   videoDrawY, // <--- Menggunakan variabel dinamis
  //   webcamReferences.width,
  //   webcamReferences.height,
  // );

  if (!webGPUMode) {
    fill("black");
    noStroke();
    blendMode("saturation");
    rect(
      0,
      videoDrawY, // <--- Menggunakan variabel dinamis
      initialResolution.width,
      webcamReferences.height + webcamHeightPlus,
    );

    fill("#4287f5");
    noStroke();
    blendMode("screen");
    rect(
      0,
      videoDrawY, // <--- Menggunakan variabel dinamis
      initialResolution.width, //webcamReferences.width,
      webcamReferences.height + webcamHeightPlus, // webcamReferences.height,
    );
  }

  // resetImageShader();
  pop();

  // B. Hitung ROI (Area kotak kuning)
  // ROI ini tidak peduli posisi atas/bawah, dia peduli rasio artwork
  let artworkRatio = initialResolution.width / initialResolution.height;
  let roiH = webcamReferences.height + webcamHeightPlus;
  let roiW = roiH * artworkRatio;
  let roiOffsetX = (webcamReferences.width - roiW) / 2;

  // C. Gambar Debug ROI (Kotak Kuning)
  push();
  noFill();
  stroke("white");

  strokeWeight(strokeWeightSize);
  // Kotak kuning harus ikut pindah sesuai posisi webcam (videoDrawY)
  rect(0, videoDrawY, roiW - strokeWeightSize - 2, roiH - strokeWeightSize - 2);
  pop();

  // ==========================================================
  // 4. LOGIKA MAPPING & CURSOR (HAND INPUT)
  // ==========================================================

  // Offset untuk mengubah koordinat ml5 (pojok kiri atas) ke p5 (tengah)
  let offsetX = webcamReferences.width / 2;
  let offsetY = webcamReferences.height / 2;

  for (let i = 0; i < hands.length; i++) {
    let hand = hands[i];
    let indexFinger = hand.keypoints[8];
    let thumbFinger = hand.keypoints[4];

    // --- A. POSISI JARI VISUAL (KOTAK KECIL) ---
    // Koordinat ini relatif terhadap WEBCAM.
    // Jadi kita harus tambah videoDrawY agar kotak kecilnya nempel di video.

    let indexX = indexFinger.x - offsetX; // X relatif tengah
    let indexY = indexFinger.y - offsetY + videoDrawY; // Y relatif tengah + Posisi Video

    let thumbX = thumbFinger.x - offsetX;
    let thumbY = thumbFinger.y - offsetY + videoDrawY;

    // --- B. MAPPING KE ARTWORK (CURSOR UTAMA) ---
    // Kita map posisi jari dari koordinat ROI ke koordinat ARTWORK

    let mappedX = map(
      indexFinger.x,
      roiOffsetX, // 0% ROI
      roiOffsetX + roiW, // 100% ROI
      -initialResolution.width / 2, // Kiri Artwork
      initialResolution.width / 2, // Kanan Artwork
      true, // Clamp
    );

    let mappedY = map(
      indexFinger.y,
      0, // Atas Video
      roiH, // Bawah Video
      -initialResolution.height / 2, // Atas Artwork
      initialResolution.height / 2, // Bawah Artwork
      true, // Clamp
    );

    // KUNCI DINAMIS: Tambahkan posisi artwork (artworkDrawY)
    let cursorX = mappedX; // X artwork biasanya 0
    let cursorY = mappedY + artworkDrawY;

    // --- C. RENDER CURSOR & VISUAL ---

    if (hand.handedness === "Right") {
      fill("white");
      noStroke();

      // 1. Cursor Utama (Bola Besar) -> Di Artwork
      circle(cursorX, cursorY, 30);

      // 2. Indikator Jari (Kotak Kecil) -> Di Webcam
      rect(indexX, indexY, 20, 20);
      rect(thumbX, thumbY, 20, 20);

      // 3. Process Input
      handleRightHandInput(indexX, indexY, thumbX, thumbY, cursorX, cursorY);
    }
    // else if (hand.handedness === "Left") {
    //   fill("white");
    //   noStroke();
    //   circle(cursorX, cursorY, 30); // Di Artwork
    //   rect(indexX, indexY, 20, 20); // Di Webcam
    //   rect(thumbX, thumbY, 20, 20); // Di Webcam
    // }
  }

  // ==========================================================
  // MOTION UPDATE
  // ==========================================================
  let currentTime = millis();
  trailBrushMotion.update(currentTime);
  trailBrushMotion.draw(currentTime);
  popTrailMotion.update(currentTime);
  popTrailMotion.draw(currentTime);

  handleMouseInput();
}

function drawBackground(artworkDrawY) {
  if (backgroundImage) {
    push();
    // imageMode(CENTER);

    // translate(-width / 2, -height / 2);
    image(
      backgroundImage,
      0,
      artworkDrawY,
      backgroundImage.w, // bisa aja artworkCanvas.w
      (backgroundImage.height / backgroundImage.width) * backgroundImage.w,
    );

    pop();
  }
}

window.recorderInstance = null;

// window.onPopupReady = async () => {
//   const root = popupController.document.getElementById("popup-controller");

//   // if (!recorderInstance) {
//   //   console.log("🎥 create recorder (once)");
//   // } else {
//   //   console.log("♻️ reuse recorder");
//   // }

//   // recorderInstance.parent(root);
//   // recorderInstance.style.display = "unset";
//   //
// };

function canvasController() {
  const controller = mainController.querySelector("#openControl");

  controller.addEventListener("click", () => {
    if (popupController && !popupController.closed) {
      popupController.focus();
      return;
    }

    popupController = window.open(
      "config.html",
      "controllerWindow",
      "width=300,height=800",
    );
  });
}

canvasController();

function processTrailMouseInput(conf) {
  let m = trailBrushMotion;
  if (!m.isDrawing) {
    m.lastDrawX = mouseX;
    m.lastDrawY = mouseY;
    m.spawnBox(mouseX, mouseY, conf);
    m.isDrawing = true;
  } else {
    let d = dist(m.lastDrawX, m.lastDrawY, mouseX, mouseY);
    if (d >= conf.spacing) {
      let angle = atan2(mouseY - m.lastDrawY, mouseX - m.lastDrawX);
      let steps = floor(d / conf.spacing);
      for (let i = 1; i <= steps; i++) {
        m.spawnBox(
          m.lastDrawX + cos(angle) * conf.spacing * i,
          m.lastDrawY + sin(angle) * conf.spacing * i,
          conf,
        );
      }
      m.lastDrawX = mouseX;
      m.lastDrawY = mouseY;
    }
  }
}

let isHandPinching = false; // State untuk hysteresis
// Variabel untuk menyimpan posisi halus
let smoothX = 0;
let smoothY = 0;

// Config seberapa "berat/delay" gerakannya
// 0.05 = Sangat smooth & lambat (delay kerasa banget, kayak 1 detik)
// 0.1  = Medium
// 0.5  = Cepat (hampir nempel tangan)
let easingFactor = 0.1;

let hasHandHistory = true; // Supaya gak ada garis kaget dari 0,0 pas awal

function processTrailHandInput(conf, inputX, inputY) {
  // inputX/Y di sini adalah smoothX/Y
  let m = trailBrushMotion;

  // Deadzone bisa dikecilin dikit karena inputnya udah smooth
  let deadZone = 80;

  let d = 0;
  if (m.lastDrawX !== null && m.lastDrawY !== null) {
    d = dist(m.lastDrawX, m.lastDrawY, inputX, inputY);
  } else {
    d = 9999;
  }

  if (!m.isDrawing) {
    // Kalau tangan diem (d < deadzone), jangan gambar
    if (d > deadZone) {
      m.spawnBox(inputX, inputY, conf);
      m.lastDrawX = inputX;
      m.lastDrawY = inputY;
      m.isDrawing = true; // Aktifkan drawing state
    }
  } else {
    // Logic Trail Normal
    if (d >= conf.spacing) {
      let angle = atan2(inputY - m.lastDrawY, inputX - m.lastDrawX);
      let steps = floor(d / conf.spacing);

      for (let i = 1; i <= steps; i++) {
        m.spawnBox(
          m.lastDrawX + cos(angle) * conf.spacing * i,
          m.lastDrawY + sin(angle) * conf.spacing * i,
          conf,
        );
      }
      m.lastDrawX = inputX;
      m.lastDrawY = inputY;
    }
  }
}

function handleRightHandInput(
  indexX,
  indexY,
  thumbX,
  thumbY,
  cursorX, // <-- Ini posisi ASLI yang jaggy
  cursorY, // <-- Ini posisi ASLI yang jaggy
) {
  // 1. Inisialisasi posisi awal (biar gak nge-glitch dari pojok kiri atas)
  if (!hasHandHistory) {
    smoothX = cursorX;
    smoothY = cursorY;
    hasHandHistory = true;
  }

  // 2. RUMUS SAKTI (LERP): Smoothing + Delay
  // "smoothX mendekati cursorX sebesar 8% setiap frame"
  smoothX = lerp(smoothX, cursorX, easingFactor);
  smoothY = lerp(smoothY, cursorY, easingFactor);

  // Debug Visual (Opsional):
  // fill("#4287f5"); circle(smoothX, smoothY, 15); // Lihat bedanya bola biru (smooth) vs merah (asli)

  let indexAndThumbDistance = dist(indexX, indexY, thumbX, thumbY);

  // LOGIKA HYSTERESIS (Yang tadi kita bahas)
  let pinchStart = 40;
  let pinchRelease = 80;

  if (!isHandPinching && indexAndThumbDistance < pinchStart) {
    isHandPinching = true;
  } else if (isHandPinching && indexAndThumbDistance > pinchRelease) {
    isHandPinching = false;
  }

  if (isHandPinching) {
    let conf =
      trailBrushMotion.configs[trailBrushMotion.usedConfig] ||
      trailBrushMotion.configs.letter;

    // 3. PENTING: Kirim smoothX dan smoothY, BUKAN cursorX/cursorY
    processTrailHandInput(conf, smoothX, smoothY);
  } else {
    trailBrushMotion.isDrawing = false;
  }
}
function handleMouseInput() {
  if (mouseIsPressed && mouseButton === LEFT) {
    if (trailBrushMotion.configs[trailBrushMotion.usedConfig]) {
      processTrailMouseInput(
        trailBrushMotion.configs[trailBrushMotion.usedConfig],
      );
    } else {
      processTrailMouseInput(trailBrushMotion.configs.letter); // default is letter
    }
  } else {
    trailBrushMotion.isDrawing = false;
  }
}

const motions = {
  trailBrushMotion,
  popTrailMotion,
};

function reverseShortcut(motions, shortcut) {
  const results = [];

  for (const motionName in motions) {
    const motion = motions[motionName];
    const configs = motion.configs;

    for (const configName in configs) {
      const cfg = configs[configName];

      if (cfg.shortcut === shortcut) {
        results.push({
          source: motionName,
          config: configName,
          shortcut: cfg.shortcut,
        });
      }
    }
  }

  return results;
}

let startRecordPressed = false;
let loopStatus = true;

function keyPressed() {
  // Fungsi ini hanya jalan 1x setiap kali tombol ditekan
  //
  // if (key === "4") {
  //   popTrailMotion.trigger("butterfly");
  // }

  if (key) {
    let shortcutPressed = reverseShortcut(motions, key);
    // console.log(shortcutPressed[0]);
    if (reverseShortcut(motions, key).length !== 0) {
      switch (shortcutPressed[0].source) {
        case "popTrailMotion":
          popTrailMotion.trigger(shortcutPressed[0].config);
          popTrailMotion.usedConfig = shortcutPressed[0].config;
          break;
        case "trailBrushMotion":
          trailBrushMotion.usedConfig = shortcutPressed[0].config;
          break;
        default:
      }
    }
  }

  if (key.toLowerCase() == "r") {
    if (startRecordPressed) {
      saveRecording();
      startRecordPressed = false;
    } else {
      record();
      startRecordPressed = true;
    }
  }

  if (key.toLowerCase() == "l") {
    if (loopStatus) {
      noLoop();
      loopStatus = false;
    } else {
      loop();
      loopStatus = true;
    }
  }

  // console.log(key);
  // console.log(reverseShortcut(motions, key));
}

function changeBackgroundColor(color) {
  backgroundColor = color;
  document.body.style.backgroundColor = color;
}
