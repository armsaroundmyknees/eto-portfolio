let mainCanvas = document.getElementById("main-canvas");
let pageTitle = document.title;
let backgroundImage;

// --- NAMESPACE: popTrailMotion ---
const popTrailMotion = {
  boxes: [],
  activeEmitters: [], // Melacak "Kepala" yang sedang terbang
  frameIndex: 0,

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
      easing: "size",
      // Tambahan khusus popTrail
      moveSpeed: 2, // Kecepatan terbang
      noiseScale: 0.03, //0.005, // Kelenturan belokan (semakin kecil semakin lurus)
    },
  },

  // Fungsi untuk memicu kemunculan baru (Panggil ini dari handleInput)
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
      let e = this.activeEmitters[i];

      // Hitung pergerakan kupu-kupu dengan Perlin Noise
      let angle = noise(e.offSetX, e.offSetY, currentTime * 0.001) * TWO_PI * 2;
      e.x += cos(angle) * e.conf.moveSpeed;
      e.y += sin(angle) * e.conf.moveSpeed;

      // Update seed noise agar terus bergerak
      e.offSetX += e.conf.noiseScale;
      e.offSetY += e.conf.noiseScale;

      // Logika Spawn Jejak (Trail)
      let d = dist(e.x, e.y, e.lastSpawnX, e.lastSpawnY);
      if (d >= e.conf.spacing) {
        this.spawnBox(e.x, e.y, e.conf);
        e.lastSpawnX = e.x;
        e.lastSpawnY = e.y;
      }

      // Hapus emitter jika keluar canvas
      if (e.x < -100 || e.x > width + 100 || e.y < -100 || e.y > height + 100) {
        this.activeEmitters.splice(i, 1);
      }
    }

    // 2. Update Boxes (Pembersihan box yang sudah mati)
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
  },

  // --- Reuse Logika dari trailBrushMotion ---
  drawSilhouettes: function (currentTime) {
    this.renderRects(currentTime, "stroke");
    this.renderRects(currentTime, "fill");
  },

  renderRects: function (currentTime, type) {
    push();
    rectMode(CENTER);
    noStroke();

    // Cache millis untuk mengurangi pemanggilan fungsi di dalam loop
    let currentMillis = millis();

    for (let b of this.boxes) {
      let age = currentTime - b.born;
      let scaleVal = this.calculateScale(age, b.deathDuration, b.conf.easing);

      // Gunakan variabel lokal daripada berkali-kali akses objek/property
      let bConf = b.conf;
      let offset = type === "stroke" ? bConf.boxStrokeWeight || 8 : 0;
      let col = type === "stroke" ? bConf.boxStrokeColor : bConf.boxFillColor;

      fill(col);

      // Hitung boiling hanya sekali
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
const trailBrushMotion = {
  boxes: [],
  frameIndex: 0,
  lastDrawX: null,
  lastDrawY: null,
  isDrawing: false,

  // Konfigurasi Preset dalam Motion ini
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
      boxFillColor: "#00ff00",
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "none",
    },
    bird2: {
      frames: [],
      frameData: { filename: "bird", length: 6, ext: "png" },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 400,
      maxLifeTime: 6000,
      boxStrokeWeight: 0,
      boxStrokeColor: "rgba(255,255,255,0)",
      boxFillColor: "rgba(255,255,255,0)",
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      boxOverlapSize: 0.5,
      pauseBoxBefore: true,
      easing: "none",
    },
    letter: {
      frames: [],
      frameData: { filename: "frame", length: 8, ext: "png" },
      boxWidth: 80,
      spacing: 80,
      baseLifeTime: 400,
      maxLifeTime: 5000,
      boxStrokeWeight: 8,
      boxStrokeColor: "#00ff00",
      boxFillColor: "#dddddd",
      imageLifeTimeDelay: 110,
      animationSpeed: 100,
      boxOverlapSize: 0.5,
      pauseBoxBefore: false,
      easing: "size",
    },
    // Kamu bisa tambah preset lain khusus untuk trailBrushMotion di sini
  },
  // Method Utama untuk Siklus Hidup
  update: function (currentTime) {
    while (
      this.boxes.length > 0 &&
      currentTime - this.boxes[0].born > this.boxes[0].deathDuration
    ) {
      this.boxes.shift();
    }
  },

  draw: function (currentTime) {
    if (this.boxes.length === 0) return;

    // 1. Layer Siluet (Menggunakan warna dari config)
    this.drawSilhouettes(currentTime);

    // 2. Layer Image (Dengan perhitungan LifeTimeDelay)
    for (let b of this.boxes) {
      let age = currentTime - b.born;

      // Hitung durasi hidup gambar secara spesifik
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
    this.renderRects(currentTime, "stroke");
    // Layer Depan (Fill) - Menggunakan boxFillColor
    this.renderRects(currentTime, "fill");
  },

  renderRects: function (currentTime, type) {
    push();
    rectMode(CENTER);
    noStroke();

    // Cache millis untuk mengurangi pemanggilan fungsi di dalam loop
    let currentMillis = millis();

    for (let b of this.boxes) {
      let age = currentTime - b.born;
      let scaleVal = this.calculateScale(age, b.deathDuration, b.conf.easing);

      // Gunakan variabel lokal daripada berkali-kali akses objek/property
      let bConf = b.conf;
      let offset = type === "stroke" ? bConf.boxStrokeWeight || 8 : 0;
      let col = type === "stroke" ? bConf.boxStrokeColor : bConf.boxFillColor;

      fill(col);

      // Hitung boiling hanya sekali
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
  },

  // Perubahan: Menerima durasi spesifik agar bisa fleksibel antara box vs image
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

// --- GLOBAL P5 FUNCTIONS ---

function preload() {
  backgroundImage = loadImage("../images/atas-atap.webp");

  // Load frames untuk semua preset di dalam trailBrushMotion
  for (let key in trailBrushMotion.configs) {
    let conf = trailBrushMotion.configs[key];
    for (let i = 1; i <= conf.frameData.length; i++) {
      conf.frames.push(
        loadImage(
          `../images/${conf.frameData.filename}-${i}.${conf.frameData.ext}`,
        ),
      );
    }
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
}

function setup() {
  createCanvas(1920, 1080, mainCanvas);
  // imageMode(CENTER);
  // rectMode(CENTER);
  setupRecorder();
  pixelDensity(1);
}

function draw() {
  background(255);
  drawBackground();

  let currentTime = millis();

  // Jalankan siklus hidup trailBrushMotion
  trailBrushMotion.update(currentTime);
  trailBrushMotion.draw(currentTime);

  popTrailMotion.update(currentTime);
  popTrailMotion.draw(currentTime);

  handleInput();
}

function drawBackground() {
  if (backgroundImage) {
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
  }
}

function handleInput() {
  let activeConf = null;

  // Cek apakah user menggunakan trailBrushMotion
  if (
    (mouseIsPressed && mouseButton === LEFT) ||
    (keyIsPressed && key.toLowerCase() === "1")
  ) {
    activeConf = trailBrushMotion.configs.bird;
  }

  if (keyIsPressed && key.toLowerCase() === "2") {
    activeConf = trailBrushMotion.configs.letter;
  }

  if (keyIsPressed && key.toLowerCase() === "3") {
    activeConf = trailBrushMotion.configs.bird2;
  }

  if (activeConf) {
    processTrailInput(activeConf);
  } else {
    trailBrushMotion.isDrawing = false;
  }

  // Recording;
  if (key === "R" || key === "r") startRecording();
  if (key === "S" || key === "s") stopRecording();
}

function keyPressed() {
  // Fungsi ini hanya jalan 1x setiap kali tombol ditekan
  if (key === "4") {
    popTrailMotion.trigger("butterfly");
  }
}

function processTrailInput(conf) {
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

// --- RECORDER UTILS (Global) ---
let mediaRecorder,
  recordedChunks = [],
  isRecording = false;

function setupRecorder() {
  const stream = mainCanvas.captureStream(60);
  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "video/webm; codecs=vp9",
    videoBitsPerSecond: 25_000_000,
  });
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = saveRecording;
}

function startRecording() {
  if (isRecording) return;
  recordedChunks = [];
  mediaRecorder.start();
  isRecording = true;
  document.title = "rec ● " + pageTitle;
}

function stopRecording() {
  if (!isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  document.title = pageTitle;
}

function saveRecording() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `anim-${Date.now()}.webm`;
  a.click();
}
