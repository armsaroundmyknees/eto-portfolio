//========================= initializing Q5
let webGPUMode = true;
let initialResolution = { width: 1080, height: 1350 }; // artwork size before webcam and spacer
let artworkCanvas;
let _mouseX, _mouseY;

//========================= indicator
let sketchColors = {
  red: "red",
  blue: "#4287f5",
  orange: "#fcae6a",
  gray1: "#dddddd",
  gray2: "#8a8a8a",
  gray3: "#636363",
  grayblue: "#dddddd",
  cream: "#e8da99",
  toRGB01: function (color) {
    return hexToRGB01(color);
  },
};

//========================= q5 webcam
let webcamHeightSpacer = 20;
let webcamHeightPlus = 0;
let webcamReferences;
let webcamPosition = "TOP";

//========================= ROI
let cursorCirclesTrail = [];
const maxCursorTrail = 50;

//========================= dom
let noticeBlock = document.getElementById("main-notice");
let noticePreloadStats = noticeBlock.querySelector("#loading-status-notice");
let pageTitle = document.title;
let mainCanvas = document.getElementById("main-canvas");
let mainController = document.getElementById("main-controller");
let popupController = null;
let recordElement;
let controller = mainController.querySelector("#openControl");
controller.addEventListener("click", canvasController);

//========================= q5 draw
let strokeSize = 5;
let loopStatus = true;
let motionsList = {};

let drawSettings = {
  strokeSize: 5,
  squareSize: 15,
  artworkCursor: true,
};

//========================= q5 -> ml5 config
let handPose;
let hands = [];

//========================= q5 bg + dom bg
let backgroundColor = sketchColors.gray2;
document.body.style.backgroundColor = backgroundColor;

//========================= q5 recorder
window.recorderInstance = null;

//========================= q5 pinch gesture
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

//========================= initializing Q5

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
    //
    monotoneShader = await createVideoShader(`
      fn screen(base: vec3f, blend: vec3f) -> vec3f {
        return 1.0 - (1.0 - base) * (1.0 - blend);
      }

      @fragment
      fn fragMain(f: FragParams) -> @location(0) vec4f {
        let src = textureSampleBaseClampToEdge(tex, samp, f.texCoord);

        let lum = dot(src.rgb, vec3f(0.299, 0.587, 0.114));
        let gray = vec3f(lum);

        // sketchColors.blue = #4287f5
        let fillColor = vec3f(
          66.0 / 255.0,
          135.0 / 255.0,
          245.0 / 255.0
        );

        let result = screen(gray, fillColor);
        return vec4f(result, src.a);
      }

    `);
  }
}

//========================= drawFrames / animaiton
window.drawFrames = {
  configs: {
    animation1: {
      frames: [],
      frameData: {
        filename: "anim1",
        imageDir: "assets/drawFrames",
        length: 4, // jumlah frame
        ext: "png",
        pad: 3, // bird-000.png (gampang diubah kalau mau)
        start: 1, // mulai dari index terkecil
      },
      frameDuration: 700, // ms
      _lastTime: 0,
      _frameIndex: 0,
    },
  },

  fetchConfig: function () {
    for (let key in drawFrames.configs) {
      let conf = drawFrames.configs[key];

      for (let i = 0; i < conf.frameData.length; i++) {
        const index = conf.frameData.start + i;
        const number = String(index).padStart(conf.frameData.pad, "0");
        const path = `${conf.frameData.imageDir}/${conf.frameData.filename}-${number}.${conf.frameData.ext}`;

        conf.frames.push(loadImage(path));
      }
    }
  },

  draw(configName, w, h, x = 0, y = 0) {
    const cfg = this.configs[configName];
    if (!cfg || cfg.frames.length === 0) return;

    const now = millis();

    if (now - cfg._lastTime >= cfg.frameDuration) {
      cfg._frameIndex = (cfg._frameIndex + 1) % cfg.frames.length;
      cfg._lastTime = now;
    }

    const img = cfg.frames[cfg._frameIndex];

    const drawW = w ?? img.width;
    const drawH = h ?? img.height;

    image(img, x, y, drawW, drawH);
  },
};

//=========================  poptrailmotions
window.popTrailMotion = {
  boxes: [],
  activeEmitters: [], // Melacak "Kepala" yang sedang terbang
  frameIndex: 0,
  usedConfig: "butterfly",

  configs: {
    butterfly: {
      frames: [],
      frameData: {
        filename: "bird",
        imageDir: "assets/motions",
        length: 6,
        ext: "png",
        pad: 3,
        start: 1,
      }, // Pakai bird sebagai contoh
      boxWidth: 60,
      spacing: 40,
      baseLifeTime: 1000,
      maxLifeTime: 6000,
      boxStrokeWeight: 10,
      boxStrokeColor: "black",
      boxFillColor: "white",
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
      frameData: {
        filename: "bird",
        imageDir: "assets/motions",
        length: 6,
        ext: "png",
        pad: 3,
        start: 1,
      }, // Pakai bird sebagai contoh
      boxWidth: 60,
      spacing: 40,
      baseLifeTime: 1000,
      maxLifeTime: 6000,
      boxStrokeWeight: 10,
      boxStrokeColor: "white",
      boxFillColor: "black",
      imageLifeTimeDelay: -800,
      animationSpeed: 150,
      boxOverlapSize: 0.3,
      pauseBoxBefore: false,
      easing: "size", // Tambahan khusus popTrail
      moveSpeed: 2, // Kecepatan terbang
      noiseScale: 0.03, //0.005, // Kelenturan belokan (semakin kecil semakin lurus)
      shortcut: "5",
    },
  }, // Fungsi untuk memicu kemunculan baru (Panggil ini dari handleInput)

  fetchConfig: async function () {
    for (let key in popTrailMotion.configs) {
      let conf = popTrailMotion.configs[key];

      for (let i = 0; i < conf.frameData.length; i++) {
        const index = conf.frameData.start + i;
        const number = String(index).padStart(conf.frameData.pad, "0");
        const path = `${conf.frameData.imageDir}/${conf.frameData.filename}-${number}.${conf.frameData.ext}`;

        conf.frames.push(loadImage(path));
      }
    }
  },

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

//========================= trailBrushMoion
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
      frameData: {
        filename: "bird",
        imageDir: "assets/motions",
        length: 6,
        ext: "png",
        pad: 3,
        start: 1,
      },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 200,
      maxLifeTime: 6000,
      boxStrokeWeight: 8,
      boxStrokeColor: "black",
      boxFillColor: sketchColors.cream,
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "none",
      shortcut: "1",
    },
    bird2: {
      frames: [],
      frameData: {
        filename: "bird",
        imageDir: "assets/motions",
        length: 6,
        ext: "png",
        pad: 3,
        start: 1,
      },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 400,
      maxLifeTime: 6000,
      boxStrokeWeight: 0,
      boxStrokeColor: cssToRGBA("rgba(255,255,255,0.5)"),
      boxFillColor: cssToRGBA("rgba(0,0,0,0.5)"),
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "none",
      shortcut: "2",
    },
    letter: {
      frames: [],
      frameData: {
        filename: "frame",
        imageDir: "assets/motions",
        length: 8,
        ext: "png",
        pad: 3,
        start: 1,
      },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 400,
      maxLifeTime: 5000,
      boxStrokeWeight: 10,
      boxStrokeColor: "black",
      boxFillColor: "white",
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "size",
      shortcut: "3",
    }, // Kamu bisa tambah preset lain khusus untuk trailBrushMotion di sini
  }, // Method Utama untuk Siklus Hidup

  fetchConfig: async function () {
    for (let key in trailBrushMotion.configs) {
      let conf = trailBrushMotion.configs[key];

      for (let i = 0; i < conf.frameData.length; i++) {
        const index = conf.frameData.start + i;
        const number = String(index).padStart(conf.frameData.pad, "0");
        const path = `${conf.frameData.imageDir}/${conf.frameData.filename}-${number}.${conf.frameData.ext}`;

        conf.frames.push(loadImage(path));
      }
    }
  },

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

//========================= cssToRGBA helper
function cssToRGBA(css) {
  const m = css
    .match(/rgba?\(([^)]+)\)/)[1]
    .split(",")
    .map((v) => parseFloat(v));

  return [m[0] / 255, m[1] / 255, m[2] / 255, m[3] ?? 1];
}

function hexToRGB01(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

//========================= ml5.js gothands
function gotHands(results) {
  // Save the output to the hands variable
  hands = results;
  // console.log(hands);
}

//========================= q5 - setup()
async function setup() {
  //------ artwork canvas setup

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
  artworkCanvas.style.border = "2px solid " + sketchColors.gray3;

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

  //----- all canvas configuration
  imageMode(CENTER);
  rectMode(CENTER);
  ellipseMode(CENTER);

  loop();

  // 1. Load frames untuk trailBrushMotion (PENTING!)
  trailBrushMotion
    .fetchConfig()
    .then((motionsList["trailBrushMotion"] = trailBrushMotion));

  // // 2. Load frames untuk popTrailMotion (PENTING!)
  popTrailMotion
    .fetchConfig()
    .then((motionsList["popTrailMotion"] = popTrailMotion));

  // // 3. load frame untuk drawFrames
  drawFrames.fetchConfig();

  // pixelDensity(1);
  //
  //
  //

  recorderInstance = await createRecorder();
  // recorderInstance.style.display = "none";
  recorderInstance.parent(mainController);
}

//=========================  q5 draw()
function draw() {
  // noLoop();
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
  fill(sketchColors.grayblue);
  // stroke("white");
  // strokeWeight(10);
  noStroke();
  rect(0, artworkDrawY, initialResolution.width, initialResolution.height);
  drawFrames.draw("animation1", 1080, 1350, 0, artworkDrawY);
  pop();

  // ==========================================================
  // 3. DRAW WEBCAM & ROI
  // ==========================================================

  // A. Gambar Webcam Feed sesuai posisi dinamis
  push();

  if (!webGPUMode) {
    drawWebcamCover(webcamReferences, 0, videoDrawY);
    fill("black");
    noStroke();
    blendMode("saturation");
    rect(
      0,
      videoDrawY, // <--- Menggunakan variabel dinamis
      initialResolution.width,
      webcamReferences.height + webcamHeightPlus,
    );

    fill(sketchColors.blue);
    noStroke();
    blendMode("screen");
    rect(
      0,
      videoDrawY, // <--- Menggunakan variabel dinamis
      initialResolution.width, //webcamReferences.width,
      webcamReferences.height + webcamHeightPlus, // webcamReferences.height,
    );
  } else {
    shader(monotoneShader);
    drawWebcamCover(webcamReferences, 0, videoDrawY);
    resetVideoShader();
  }

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
  stroke(sketchColors.orange);

  strokeWeight(drawSettings.strokeSize);
  // Kotak kuning harus ikut pindah sesuai posisi webcam (videoDrawY)
  rect(
    0,
    videoDrawY,
    roiW - drawSettings.strokeSize - 2,
    roiH - drawSettings.strokeSize - 2,
  );
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
      fill(sketchColors.orange);
      noStroke();

      // 1. Cursor Utama (Bola Besar) -> Di Artwork
      if (drawSettings.artworkCursor) {
        rect(
          cursorX,
          cursorY,
          drawSettings.squareSize,
          drawSettings.squareSize,
        );
      }

      // 2. Indikator Jari (Kotak Kecil) -> Di Webcam
      rect(indexX, indexY, drawSettings.squareSize, drawSettings.squareSize);
      // rect(thumbX, thumbY, 20, 20);

      // 3. Process Input
      handleRightHandInput(indexX, indexY, thumbX, thumbY, cursorX, cursorY);
    }
    // else if (hand.handedness === "Left") {

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

  // =====
  // infos
  // ====
  //
  push();
  if (recording) {
    fill(sketchColors.red);
    if (recorderInstance.paused) {
      fill(sketchColors.orange);
    }
    noStroke();
    circle(
      -1 * (initialResolution.width / 2) + initialResolution.width * 0.05,
      videoDrawY - webcamReferences.height / 2 + webcamReferences.height * 0.08,
      drawSettings.squareSize,
    );
    // textSize(30);
    // textFont("monospace");
    // text(
    //   `${recorderInstance.time.hours}:${recorderInstance.time.minutes}:${recorderInstance.time.seconds}`,
    //   -1 * (webcamReferences.width / 2) + webcamReferences.width * 0.07,
    //   videoDrawY - webcamReferences.height / 2 + webcamReferences.height * 0.9,
    // );
  }

  pop();
}

//=========================  q5 draw() -> drawWebcamCover
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

//========================= canvasController
function canvasController() {
  return new Promise((resolve, reject) => {
    if (popupController && !popupController.closed) {
      // popupController.focus();
      resolve(popupController);
      return;
    }

    popupController = window.open(
      "config.html",
      "controllerWindow",
      "width=300,height=800",
    );

    if (!popupController) {
      reject("Popup blocked");
      return;
    }

    popupController.addEventListener("load", () => {
      resolve(popupController);
    });
  });
}

//========================= processTrailMouseInput
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

//========================= processTrailHandInput
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

//========================= handleRightHandInput
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
  // fill(sketchColors.grayblue); circle(smoothX, smoothY, 15); // Lihat bedanya bola biru (smooth) vs merah (asli)

  let indexAndThumbDistance = dist(indexX, indexY, thumbX, thumbY);

  // LOGIKA HYSTERESIS (Yang tadi kita bahas)
  let pinchStart = 40;
  let pinchRelease = 80;

  if (!isHandPinching && indexAndThumbDistance < pinchStart) {
    isHandPinching = true;
  } else if (isHandPinching && indexAndThumbDistance > pinchRelease) {
    isHandPinching = false;
  }

  for (let c of cursorCirclesTrail) {
    rect(c.x, c.y, c.r, c.r);
  }

  if (isHandPinching) {
    cursorCirclesTrail.push({
      x: indexX,
      y: indexY,
      r: drawSettings.squareSize,
    });

    if (cursorCirclesTrail.length > maxCursorTrail) {
      cursorCirclesTrail.shift();
    }

    let conf =
      trailBrushMotion.configs[trailBrushMotion.usedConfig] ||
      trailBrushMotion.configs.letter;

    // 3. PENTING: Kirim smoothX dan smoothY, BUKAN cursorX/cursorY
    processTrailHandInput(conf, smoothX, smoothY);
  } else {
    trailBrushMotion.isDrawing = false;

    cursorCirclesTrail = [];
  }
}

//========================= handleMouseInput
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

//========================= shortcut & helper
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

function keyPressed() {
  // Fungsi ini hanya jalan 1x setiap kali tombol ditekan
  //
  // if (key === "4") {
  //   popTrailMotion.trigger("butterfly");
  // }

  if (key) {
    let shortcutPressed = reverseShortcut(motionsList, key);
    // console.log(shortcutPressed[0]);
    if (reverseShortcut(motionsList, key).length !== 0) {
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

  if (key.toLowerCase() == "r" && !keyIsDown(CONTROL)) {
    // canvasController().then(() => {
    //   popupController.document.querySelector(".startRecord").click();
    // });
    //
    record();
  }

  if (key.toLowerCase() == "s" && !keyIsDown(CONTROL)) {
    // canvasController().then(() => {
    //   popupController.document.querySelector(".saveRecord").click();
    // });
    saveRecording();
    deleteRecording();
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
}

function changeBackgroundColor(color) {
  backgroundColor = color;
  document.body.style.backgroundColor = color;
}
