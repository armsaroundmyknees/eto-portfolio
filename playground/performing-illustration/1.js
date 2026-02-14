//========================= initializing Q5
let webGPUMode = false;
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
let isLeftMouseButtonPressed = false;
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

// ===============================
// SPAWN BACKGROUND LIST
// ===============================
window.spawnBackgroundList = {
  configs: {
    // contoh:
    background1: {
      backgroundList: [
        "assets/motionsBackground/bg1-01.png",
        "assets/motionsBackground/bg1-02.png",
      ],
      backgrounds: [],
    },
  },

  fetchConfig: async function () {
    for (let key in this.configs) {
      let conf = this.configs[key];
      conf.backgrounds = [];

      for (let path of conf.backgroundList) {
        conf.backgrounds.push(loadImage(path));
      }
    }
  },
};

// ===============================
// TRAIL BRUSH MOTION BITMAP (UPDATED)
// ===============================
window.trailBrushMotionBitmap = {
  boxes: [],
  autoPilots: [], // Array to store continuing trails
  frameIndex: 0,
  usedConfig: "bird",
  lastDrawX: null, // Track last drawing position for continuity
  lastDrawY: null,
  inputVelocity: { x: 0, y: 0 }, // Track input velocity for momentum
  isDrawing: false,

  configs: {
    bird: {
      frames: [],
      frameBackgrounds: [], // auto diisi fetch

      frameData: {
        filename: "bird",
        imageDir: "assets/motions",
        length: 6,
        ext: "png",
        pad: 3,
        start: 1,
      },

      background: spawnBackgroundList.configs.background1,
      // "useFrame"
      // atau
      // background: spawnBackgroundList.configs.background1

      maxBackground: 3,
      backgroundScale: 1.3,
      backgroundScaleJitter: [1.3, 1.6], // null untuk gak ada jitter

      mainImageScale: 0.6,

      spacing: 80,
      baseLifeTime: 200,
      maxLifeTime: 6000,
      imageLifeTimeDelay: -100,
      animationSpeed: 200,
      pauseBoxBefore: false,
      easing: "scale",
      shortcut: "1",
      
      // --- NEW CONFIG FOR AUTO-PILOT ---
      continueAfterRelease: true, 
      steerForce: 0.15, // How strongly it steers to the edge (0.01 - 0.5)
      maxSpeed: 15,     // Cap speed if the throw is too fast
    },
  },

  // ===============================
  // FETCH ALL IMAGES
  // ===============================
  fetchConfig: async function () {
    for (let key in this.configs) {
      let conf = this.configs[key];
      conf.frames = [];
      conf.frameBackgrounds = [];

      // load main frames
      for (let i = 0; i < conf.frameData.length; i++) {
        const index = conf.frameData.start + i;
        const number = String(index).padStart(conf.frameData.pad, "0");

        const basePath = `${conf.frameData.imageDir}/${conf.frameData.filename}-${number}.${conf.frameData.ext}`;

        const img = loadImage(basePath);
        conf.frames.push(img);

        // background per frame
        if (conf.background === "useFrame") {
          let bgStack = [];

          for (let b = 0; b < (conf.maxBackground || 0); b++) {
            const bgPath = `${conf.frameData.imageDir}/${conf.frameData.filename}-${number}_bg${b}.${conf.frameData.ext}`;

            let bgImg = loadImage(
              bgPath,
              () => {},
              () => {}, // ignore error (file boleh gak ada)
            );

            bgStack.push(bgImg);
          }

          conf.frameBackgrounds.push(bgStack);
        }
      }
    }
  },

  // ===============================
  // AUTO PILOT LOGIC (RELEASE & CONTINUE)
  // ===============================
  triggerAutoPilot: function() {
    let conf = this.configs[this.usedConfig];
    
    // Only continue if config allows and we have a valid last position
    if (!conf.continueAfterRelease || this.lastDrawX === null) return;

    // Use current input velocity or default to a small push if stationary
    let vx = this.inputVelocity.x || random(-5, 5);
    let vy = this.inputVelocity.y || random(-5, 5);
    
    // Ensure minimum speed to prevent getting stuck
    if (Math.abs(vx) < 1 && Math.abs(vy) < 1) {
        vx = random(-5, 5);
        vy = random(-5, 5);
    }

    this.autoPilots.push({
        pos: createVector(this.lastDrawX, this.lastDrawY),
        vel: createVector(vx, vy),
        conf: conf,
        lastSpawnPos: createVector(this.lastDrawX, this.lastDrawY)
    });
  },

  updateAutoPilots: function(currentTime) {
    for (let i = this.autoPilots.length - 1; i >= 0; i--) {
        let p = this.autoPilots[i];
        
        // 1. Calculate Steering to Nearest Edge
        let bounds = {
            top: -initialResolution.height / 2,
            bottom: initialResolution.height / 2,
            left: -initialResolution.width / 2,
            right: initialResolution.width / 2
        };

        // Find distances to all edges
        let dTop = Math.abs(p.pos.y - bounds.top);
        let dBottom = Math.abs(p.pos.y - bounds.bottom);
        let dLeft = Math.abs(p.pos.x - bounds.left);
        let dRight = Math.abs(p.pos.x - bounds.right);

        // Determine closest edge target
        let target = createVector(p.pos.x, p.pos.y);
        let minDist = Math.min(dTop, dBottom, dLeft, dRight);
        
        // Push target slightly outside the canvas to ensure it leaves
        let buffer = 200; 

        if (minDist === dTop) target.y = bounds.top - buffer;
        else if (minDist === dBottom) target.y = bounds.bottom + buffer;
        else if (minDist === dLeft) target.x = bounds.left - buffer;
        else if (minDist === dRight) target.x = bounds.right + buffer;

        // Apply Steering Behavior (Seek)
        let desired = p5.Vector.sub(target, p.pos);
        desired.normalize();
        desired.mult(p.conf.maxSpeed || 15);
        
        let steer = p5.Vector.sub(desired, p.vel);
        steer.limit(p.conf.steerForce || 0.1);
        
        p.vel.add(steer);
        p.pos.add(p.vel);

        // 2. Spawn Logic
        let d = dist(p.pos.x, p.pos.y, p.lastSpawnPos.x, p.lastSpawnPos.y);
        if (d >= p.conf.spacing) {
            this.spawnBox(p.pos.x, p.pos.y, p.conf);
            p.lastSpawnPos.set(p.pos);
        }

        // 3. Termination (Off-screen check)
        if (p.pos.x < bounds.left - 200 || p.pos.x > bounds.right + 200 || 
            p.pos.y < bounds.top - 200 || p.pos.y > bounds.bottom + 200) {
            this.autoPilots.splice(i, 1);
        }
    }
  },

  update: function (currentTime, confFilter = null) {
    // Standard update
    this.boxes = this.boxes.filter((b) => {
      if (confFilter && b.conf !== confFilter) return true;
      return currentTime - b.born <= b.deathDuration;
    });

    // Update auto pilots
    this.updateAutoPilots(currentTime);
  },

  // ===============================
  draw: function (currentTime, confFilter = null) {
    let boxes = confFilter
      ? this.boxes.filter((b) => b.conf === confFilter)
      : this.boxes;

    if (boxes.length === 0) return;

    // ============================================
    // AMBIL CONFIG AKTIF (JANGAN DARI BOX)
    // ============================================
    let activeConf = confFilter || this.configs[this.usedConfig];
    if (!activeConf) return;

    let maxBG = 0;

    // mode auto bg per frame
    if (activeConf.background === "useFrame") {
      maxBG = activeConf.maxBackground || 0;
    }

    // mode spawnBackgroundList
    else if (activeConf.background && activeConf.background.backgrounds) {
      maxBG = activeConf.background.backgrounds.length;
    }

    // ============================================
    // DRAW BACKGROUND GLOBAL (SEMUA BOX)
    // urutan: index kecil dulu → bawah
    // ============================================
    for (let bgIndex = 0; bgIndex < maxBG; bgIndex++) {
      for (let b of boxes) {
        let age = currentTime - b.born;

        let imageLifeDuration = b.isOverlapped
          ? 300
          : Math.max(100, b.deathDuration + (b.conf.imageLifeTimeDelay || 0));

        if (age > imageLifeDuration) continue;

        let frameIdx = this.getAnimationFrame(b, age);
        let easeScale = this.calculateScale(
          age,
          imageLifeDuration,
          b.conf.easing,
        );
        let bgBaseScale = b.conf.backgroundScale || 1;

        // ===== JITTER SCALE =====
        let jitterMul = 1;

        if (b.conf.backgroundScaleJitter) {
          let j = b.conf.backgroundScaleJitter;
          jitterMul = this.utils.biasedRandom(j[0], j[1], 2.8);
        }

        let baseScale = (b.conf.backgroundScale || 1) * (b.bgJitterMul || 1);

        // easing hanya scale masuk/keluar
        let bgScale = baseScale * easeScale;

        push();
        imageMode(CENTER);
        translate(b.x, b.y);
        scale(bgScale);

        // ================================
        // USE FRAME BACKGROUND
        // ================================
        if (b.conf.background === "useFrame") {
          let bgStack = b.conf.frameBackgrounds[frameIdx];
          if (bgStack && bgStack[bgIndex]) {
            image(bgStack[bgIndex], 0, 0);
          }
        }

        // ================================
        // spawnBackgroundList background
        // ================================
        else if (b.conf.background && b.conf.background.backgrounds) {
          let list = b.conf.background.backgrounds;
          if (list[bgIndex]) {
            image(list[bgIndex], 0, 0);
          }
        }

        pop();
      }
    }

    // ============================================
    // DRAW MAIN IMAGE GLOBAL PALING ATAS
    // ============================================
    for (let b of boxes) {
      let age = currentTime - b.born;

      let imageLifeDuration = b.isOverlapped
        ? 300
        : Math.max(100, b.deathDuration + (b.conf.imageLifeTimeDelay || 0));

      if (age > imageLifeDuration) continue;

      let frameIdx = this.getAnimationFrame(b, age);
      let mainImg = b.conf.frames[frameIdx];
      if (!mainImg) continue;

      let easeScale = this.calculateScale(
        age,
        imageLifeDuration,
        b.conf.easing,
      );
      let mainScale = easeScale * (b.conf.mainImageScale || 1);

      push();
      imageMode(CENTER);
      translate(b.x, b.y);
      scale(mainScale);
      image(mainImg, 0, 0);
      pop();
    }
  },

  // ===============================
  spawnBox: function (x, y, conf) {
    let img = conf.frames[this.frameIndex % conf.frames.length];
    if (!img) return;

    let dynamicLifeTime = map(
      this.boxes.length,
      0,
      50,
      conf.baseLifeTime,
      conf.maxLifeTime,
      true,
    );

    if (conf.pauseBoxBefore) this.freezePrevious(conf);
    // ===== generate jitter sekali saat spawn =====
    let jitterMul = 1;

    if (conf.backgroundScaleJitter) {
      let j = conf.backgroundScaleJitter;

      // biased ke min (lebih sering kecil)
      let r = Math.pow(random(), 2.8);
      jitterMul = j[0] + (j[1] - j[0]) * r;
    }

    this.boxes.push({
      x: x,
      y: y,
      conf: conf,
      born: millis(),
      deathDuration: dynamicLifeTime,
      startFrame: this.frameIndex % conf.frames.length,
      isOverlapped: this.checkOverlap(x, y, conf),
      frozenFrame: null,
      isPlaying: true,
      // simpan jitter permanen
      bgJitterMul: jitterMul,
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
      (b) => dist(x, y, b.x, b.y) < (conf.spacing || 50) * 0.5,
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
    biasedRandom: function (min, max, biasPow = 2.5) {
      let r = Math.pow(random(), biasPow);
      return min + (max - min) * r;
    },
  },
};

// ... (Rest of drawFrames and popTrailMotion code remains unchanged) ...

//========================= processTrailMouseInput (UPDATED)
function processTrailMouseInput(conf) {
  let m = trailBrushMotionBitmap;
  
  // Update Velocity for AutoPilot Calculation
  if (m.lastDrawX !== null && m.lastDrawY !== null) {
      m.inputVelocity = { 
          x: mouseX - m.lastDrawX, // approximate velocity based on last draw point
          y: mouseY - m.lastDrawY
      };
      // Or simply use mouse movement if draw spacing is large
      if (Math.abs(mouseX - pmouseX) > 0) {
          m.inputVelocity = { x: mouseX - pmouseX, y: mouseY - pmouseY };
      }
  }

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

//========================= processTrailHandInput (UPDATED)
function processTrailHandInput(conf, inputX, inputY) {
  // inputX/Y di sini adalah smoothX/Y
  let m = trailBrushMotionBitmap;

  // Calculate Velocity manually since we don't have pSmoothX
  // We use the lastDrawX as a reference, or you can add prevSmoothX variable globally
  if (m.lastDrawX !== null) {
      // Use the vector towards new point as velocity
      let vx = inputX - m.lastDrawX;
      let vy = inputY - m.lastDrawY;
      // Normalizing slightly to avoid massive spikes if jumps occur
      m.inputVelocity = { x: vx * 0.2, y: vy * 0.2 }; 
  }

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

//========================= handleRightHandInput (UPDATED)
function handleRightHandInput(
  indexX,
  indexY,
  thumbX,
  thumbY,
  cursorX, 
  cursorY, 
) {
  // 1. Inisialisasi posisi awal (biar gak nge-glitch dari pojok kiri atas)
  if (!hasHandHistory) {
    smoothX = cursorX;
    smoothY = cursorY;
    hasHandHistory = true;
  }

  // Track Previous Position for Velocity (Better than lastDrawX for throwing)
  let prevSmoothX = smoothX;
  let prevSmoothY = smoothY;

  // 2. RUMUS SAKTI (LERP): Smoothing + Delay
  smoothX = lerp(smoothX, cursorX, easingFactor);
  smoothY = lerp(smoothY, cursorY, easingFactor);
  
  // Calculate exact hand velocity for throwing
  trailBrushMotionBitmap.inputVelocity = { 
      x: smoothX - prevSmoothX, 
      y: smoothY - prevSmoothY 
  };

  let indexAndThumbDistance = dist(indexX, indexY, thumbX, thumbY);

  // LOGIKA HYSTERESIS
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
      trailBrushMotionBitmap.configs[trailBrushMotionBitmap.usedConfig] ||
      trailBrushMotionBitmap.configs.letter;

    // 3. PENTING: Kirim smoothX dan smoothY
    processTrailHandInput(conf, smoothX, smoothY);
  } else {
    // RELEASE DETECTED
    if (trailBrushMotionBitmap.isDrawing) {
        trailBrushMotionBitmap.triggerAutoPilot();
    }
    
    trailBrushMotionBitmap.isDrawing = false;
    cursorCirclesTrail = [];
  }
}

//========================= handleMouseInput (UPDATED)
function handleMouseInput() {
  if (mouseIsPressed && mouseButton === LEFT) {
    isLeftMouseButtonPressed = true;
    if (trailBrushMotionBitmap.configs[trailBrushMotionBitmap.usedConfig]) {
      processTrailMouseInput(
        trailBrushMotionBitmap.configs[trailBrushMotionBitmap.usedConfig],
      );
    } else {
      processTrailMouseInput(trailBrushMotionBitmap.configs.letter); 
    }
  } else {
    // RELEASE DETECTED
    if (trailBrushMotionBitmap.isDrawing) {
        trailBrushMotionBitmap.triggerAutoPilot();
    }
    
    trailBrushMotionBitmap.isDrawing = false;
    isLeftMouseButtonPressed = false;
  }
}