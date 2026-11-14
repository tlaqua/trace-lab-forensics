/* TRACE LAB — Forensic Spatter & Trajectory Studio
   Zero-dependency static web application for middle & high school inquiry. */

(() => {
  const state = {
    gradeLevel: "ms", // "ms" (Middle School) | "hs" (High School)
    colorblind: false
  };

  function palette() {
    if (state.colorblind) {
      return {
        stain: "#0072b2",
        stainEdge: "#7dd3fc",
        string: "#e69f00",
        accent: "#f0e442",
        good: "#56b4e9",
        grid: "#1d2a3a"
      };
    }
    return {
      stain: "#dc2626",
      stainEdge: "#fca5a5",
      string: "#ef4444",
      accent: "#38bdf8",
      good: "#22c55e",
      grid: "#1d2a3a"
    };
  }

  function getCanvasCoords(canvas, e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  // Deterministic PRNG so stain spines/satellites stay stable on redraw
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // =========================================================
  // GLOBAL NAVIGATION & ACCESSIBILITY CONTROLS
  // =========================================================
  const navTabs = document.querySelectorAll(".nav-tab");
  const panels = document.querySelectorAll(".module-panel");

  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      navTabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`mod-${tab.dataset.module}`).classList.add("active");
      redrawAll();
    });
  });

  document.getElementById("gradeToggle").addEventListener("click", () => {
    state.gradeLevel = state.gradeLevel === "ms" ? "hs" : "ms";
    document.getElementById("gradeLabel").textContent =
      state.gradeLevel === "ms" ? "Middle School" : "High School";
    document.getElementById("angleFormulaBadge").textContent =
      state.gradeLevel === "ms"
        ? "Ratio Guide: Width ÷ Length"
        : "Trigonometry: θ = arcsin(W / L)";
    updateCaliperReadout();
    updateSelectedStainUI();
    updateConvergenceReadout();
  });

  document.getElementById("colorblindToggle").addEventListener("click", () => {
    state.colorblind = !state.colorblind;
    document.body.classList.toggle("colorblind", state.colorblind);
    document.getElementById("cbLabel").textContent = state.colorblind ? "ON" : "OFF";
    redrawAll();
  });

  const modal = document.getElementById("glossaryModal");
  document.getElementById("glossaryBtn").addEventListener("click", () => {
    modal.classList.remove("hidden");
  });
  document.getElementById("closeGlossary").addEventListener("click", () => {
    modal.classList.add("hidden");
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  // =========================================================
  // MODULE 1: DROP & SURFACE LAB
  // =========================================================
  const dropCanvas = document.getElementById("dropCanvas");
  const dropCtx = dropCanvas.getContext("2d");
  const dropHeightInput = document.getElementById("dropHeight");
  const dropSurfaceInput = document.getElementById("dropSurface");
  const dropVolumeInput = document.getElementById("dropVolume");
  let dropsList = [];

  dropHeightInput.addEventListener("input", () => {
    document.getElementById("dropHeightVal").textContent = `${dropHeightInput.value} m`;
  });
  dropVolumeInput.addEventListener("input", () => {
    document.getElementById("dropVolumeVal").textContent = `${Number(dropVolumeInput.value).toFixed(2)} mL`;
  });

  document.getElementById("btnSimulateDrop").addEventListener("click", () => {
    const h = parseFloat(dropHeightInput.value);
    const vol = parseFloat(dropVolumeInput.value);
    const surf = dropSurfaceInput.value;

    // Empirical asymptotic diameter model (mm): grows with height up to ~2.5m plateau
    const baseSize = 9.5 + (vol - 0.05) * 90;
    const heightFactor = 1 + 0.72 * (1 - Math.exp(-1.35 * h));
    const surfaceSpread = { glass: 1.0, drywall: 1.08, concrete: 1.18, fabric: 1.32 }[surf];
    const diameterMm = +(baseSize * heightFactor * surfaceSpread).toFixed(1);

    const x = 140 + (dropsList.length % 4) * 160 + (Math.random() * 20 - 10);
    const y = dropsList.length < 4 ? 170 : 320;

    dropsList.push({
      x,
      y,
      h,
      vol,
      surf,
      diameterMm,
      seed: Math.floor(Math.random() * 100000)
    });
    if (dropsList.length > 8) dropsList.shift();

    const notes = {
      glass: "Smooth surface: clean circular edge, very few spines.",
      drywall: "Semi-porous surface: mild edge scalloping at higher heights.",
      concrete: "Rough surface: prominent spines and satellite droplets break off.",
      fabric: "Woven fibers absorb and wick simulant along thread directions."
    };

    document.getElementById("dropReadout").innerHTML = `
      <strong>Latest Drop (${h.toFixed(1)} m onto ${surf}):</strong><br>
      Measured Diameter: <strong>${diameterMm} mm</strong><br>
      ${notes[surf]}
    `;
    drawDropModule();
  });

  document.getElementById("btnClearDrops").addEventListener("click", () => {
    dropsList = [];
    document.getElementById("dropReadout").innerHTML =
      "<strong>Target Reset:</strong> Ready for new trial.";
    drawDropModule();
  });

  function drawGrid(ctx, canvas, step = 25) {
    const pal = palette();
    ctx.fillStyle = "#080c12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  function drawDropModule() {
    drawGrid(dropCtx, dropCanvas, 25); // 25px = 5mm (5px per mm)
    const pal = palette();

    dropsList.forEach((d, idx) => {
      const r = (d.diameterMm / 2) * 4.5;
      const rand = mulberry32(d.seed);
      const roughness = { glass: 0.03, drywall: 0.12, concrete: 0.3, fabric: 0.25 }[d.surf];
      const spineCount = Math.floor(8 + d.h * 8 * (roughness * 3));

      dropCtx.save();
      dropCtx.translate(d.x, d.y);

      // Irregular stain polygon
      dropCtx.fillStyle = pal.stain;
      dropCtx.beginPath();
      const steps = 64;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        let spike = 0;
        if (d.surf === "fabric") {
          spike = Math.abs(Math.cos(a * 2)) * r * 0.22;
        } else {
          spike = Math.pow(Math.abs(Math.sin(a * spineCount * 0.5)), 4) * r * roughness * (0.5 + rand());
        }
        const rad = r + spike;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) dropCtx.moveTo(px, py);
        else dropCtx.lineTo(px, py);
      }
      dropCtx.closePath();
      dropCtx.fill();

      // Satellites for rough surfaces & heights > 0.7m
      const satCount = d.surf === "glass" ? 0 : Math.floor(d.h * 4 * roughness * 3);
      for (let s = 0; s < satCount; s++) {
        const a = rand() * Math.PI * 2;
        const dist = r + 6 + rand() * 24;
        const sr = 1.5 + rand() * 2.8;
        dropCtx.beginPath();
        dropCtx.arc(Math.cos(a) * dist, Math.sin(a) * dist, sr, 0, Math.PI * 2);
        dropCtx.fill();
      }

      dropCtx.fillStyle = "#e6eef8";
      dropCtx.font = "12px system-ui";
      dropCtx.textAlign = "center";
      dropCtx.fillText(`#${idx + 1}: ${d.diameterMm} mm (${d.h}m)`, 0, r + 24);
      dropCtx.restore();
    });
  }

  // =========================================================
  // MODULE 2: ANGLE & DIRECTION LAB
  // =========================================================
  const angleCanvas = document.getElementById("angleCanvas");
  const angleCtx = angleCanvas.getContext("2d");
  const angleSlider = document.getElementById("angleSlider");
  const dirSlider = document.getElementById("dirSlider");

  const angleState = {
    trueAngle: 45,
    trueDir: 0,
    mysteryMode: false,
    caliperStart: null,
    caliperEnd: null,
    dragging: false,
    lastW: null,
    lastL: null
  };

  angleSlider.addEventListener("input", () => {
    angleState.mysteryMode = false;
    angleState.trueAngle = parseInt(angleSlider.value, 10);
    document.getElementById("angleVal").textContent = `${angleState.trueAngle}°`;
    drawAngleModule();
  });

  dirSlider.addEventListener("input", () => {
    angleState.mysteryMode = false;
    angleState.trueDir = parseInt(dirSlider.value, 10);
    document.getElementById("dirVal").textContent = `${angleState.trueDir}°`;
    drawAngleModule();
  });

  document.getElementById("angleModeChallenge").addEventListener("click", () => {
    angleState.mysteryMode = true;
    angleState.trueAngle = 15 + Math.floor(Math.random() * 65);
    angleState.trueDir = Math.floor(Math.random() * 72) * 5;
    angleState.caliperStart = null;
    angleState.caliperEnd = null;
    document.getElementById("angleVal").textContent = "Mystery ?";
    document.getElementById("dirVal").textContent = "Mystery ?";
    document.getElementById("angleFeedback").textContent =
      "Measure Width and Length with the caliper, then enter your angle estimate!";
    drawAngleModule();
  });

  document.getElementById("btnCheckAngleGuess").addEventListener("click", () => {
    const guess = parseFloat(document.getElementById("angleGuessInput").value);
    const fb = document.getElementById("angleFeedback");
    if (isNaN(guess)) {
      fb.textContent = "Enter a number between 5 and 90.";
      return;
    }
    const diff = Math.abs(guess - angleState.trueAngle);
    if (diff <= 4) {
      fb.style.color = palette().good;
      fb.textContent = `Spot on! True impact angle was ${angleState.trueAngle}° (within ±${diff.toFixed(1)}°).`;
    } else {
      fb.style.color = "#f59e0b";
      fb.textContent = `Close! True angle was ${angleState.trueAngle}°. Measure the widest minor axis (W) and longest major axis (L).`;
    }
  });

  angleCanvas.addEventListener("pointerdown", (e) => {
    angleState.dragging = true;
    angleState.caliperStart = getCanvasCoords(angleCanvas, e);
    angleState.caliperEnd = angleState.caliperStart;
    drawAngleModule();
  });

  angleCanvas.addEventListener("pointermove", (e) => {
    if (!angleState.dragging) return;
    angleState.caliperEnd = getCanvasCoords(angleCanvas, e);
    drawAngleModule();
  });

  window.addEventListener("pointerup", () => {
    if (angleState.dragging) {
      angleState.dragging = false;
      updateCaliperReadout();
    }
  });

  function updateCaliperReadout() {
    const box = document.getElementById("caliperReadout");
    if (!angleState.caliperStart || !angleState.caliperEnd) return;
    const dx = angleState.caliperEnd.x - angleState.caliperStart.x;
    const dy = angleState.caliperEnd.y - angleState.caliperStart.y;
    const pxLen = Math.hypot(dx, dy);
    const mm = +(pxLen / 6).toFixed(1); // 6px = 1 mm

    // Save short vs long measurements automatically
    if (!angleState.lastL || mm > angleState.lastL * 0.9) {
      // let user store W or L smoothly by tracking last two distinct drags
    }
    const trueRad = (angleState.trueAngle * Math.PI) / 180;
    const wMm = 14.0;
    const lMm = +(wMm / Math.sin(trueRad)).toFixed(1);
    const ratio = +(wMm / lMm).toFixed(2);
    const calcAngle = Math.round((Math.asin(Math.min(1, wMm / lMm)) * 180) / Math.PI);

    if (state.gradeLevel === "ms") {
      box.innerHTML = `
        <strong>Caliper Span:</strong> ${mm} mm<br>
        <strong>Stain Shape Ratios:</strong><br>
        • Narrowest Width ≈ ${wMm} mm | Length ≈ ${lMm} mm<br>
        • Width ÷ Length Ratio = <strong>${ratio}</strong> (1.0 = 90° circle; 0.5 = 30° ellipse)
      `;
    } else {
      box.innerHTML = `
        <strong>Caliper Span:</strong> ${mm} mm<br>
        • W = ${wMm} mm, L = ${lMm} mm<br>
        • $\\theta = \\arcsin(${wMm} / ${lMm}) = $ <strong>${calcAngle}°</strong>
      `;
    }
  }

  function drawAngleModule() {
    drawGrid(angleCtx, angleCanvas, 30);
    const pal = palette();
    const cx = angleCanvas.width / 2;
    const cy = angleCanvas.height / 2;
    const radAngle = (angleState.trueAngle * Math.PI) / 180;
    const dirRad = (angleState.trueDir * Math.PI) / 180;

    // Width constant at 14mm -> semi-minor b = 42px; semi-major a = b / sin(theta)
    const b = 42;
    const a = Math.min(260, b / Math.sin(radAngle));

    angleCtx.save();
    angleCtx.translate(cx, cy);
    angleCtx.rotate(dirRad);

    // Draw teardrop-tapered ellipse: blunt edge on -X (origin side), tail on +X (travel dir)
    angleCtx.fillStyle = pal.stain;
    angleCtx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      let x = Math.cos(t) * a;
      let y = Math.sin(t) * b;
      // Taper slightly toward travel tail (+X) at shallow angles
      if (x > 0 && angleState.trueAngle < 65) {
        const tailFactor = 1 - 0.35 * (x / a) * (1 - angleState.trueAngle / 90);
        y *= tailFactor;
      }
      if (i === 0) angleCtx.moveTo(x, y);
      else angleCtx.lineTo(x, y);
    }
    angleCtx.closePath();
    angleCtx.fill();

    // Satellite tail droplet if angle < 55
    if (angleState.trueAngle < 55) {
      angleCtx.beginPath();
      angleCtx.ellipse(a + 22, 0, 10, 4, 0, 0, Math.PI * 2);
      angleCtx.fill();
    }

    // Subtle direction arrow label
    angleCtx.strokeStyle = "rgba(255,255,255,0.28)";
    angleCtx.setLineDash([4, 4]);
    angleCtx.beginPath();
    angleCtx.moveTo(-a - 25, 0);
    angleCtx.lineTo(a + 45, 0);
    angleCtx.stroke();
    angleCtx.setLineDash([]);
    angleCtx.fillStyle = "#93a7c0";
    angleCtx.font = "11px system-ui";
    angleCtx.fillText("Tail points in direction of travel →", 20, -b - 12);
    angleCtx.restore();

    // Draw user caliper line
    if (angleState.caliperStart && angleState.caliperEnd) {
      const s = angleState.caliperStart;
      const e = angleState.caliperEnd;
      angleCtx.strokeStyle = pal.accent;
      angleCtx.lineWidth = 2;
      angleCtx.beginPath();
      angleCtx.moveTo(s.x, s.y);
      angleCtx.lineTo(e.x, e.y);
      angleCtx.stroke();

      const mm = (Math.hypot(e.x - s.x, e.y - s.y) / 6).toFixed(1);
      angleCtx.fillStyle = pal.accent;
      angleCtx.font = "bold 13px system-ui";
      angleCtx.fillText(`${mm} mm`, (s.x + e.x) / 2 + 8, (s.y + e.y) / 2 - 8);
    }
  }

  // =========================================================
  // MODULE 3: 3D RED STRING ROOM
  // =========================================================
  const stringCanvas = document.getElementById("stringCanvas");
  const sCtx = stringCanvas.getContext("2d");

  const roomState = {
    yaw: 0.65,
    pitch: 0.45,
    zoom: 1.55,
    dragging: false,
    dragMoved: false,
    lastMouse: { x: 0, y: 0 },
    stains: [],
    selectedId: null,
    trueOrigins: [],
    screenStains: []
  };

  function generateStainsFromOrigin(origin, count, seedStart, includeWall = true) {
    const rand = mulberry32(seedStart);
    const stains = [];
    for (let i = 0; i < count; i++) {
      const onWall = includeWall && i >= count - 2;
      let sx, sy, sz;
      if (onWall) {
        sx = origin.x + (rand() * 140 - 70);
        sy = 200; // back wall Y = 200
        sz = Math.max(15, Math.min(185, origin.z - 10 + (rand() * 80 - 40)));
      } else {
        const ang = rand() * Math.PI * 2;
        const dist = 45 + rand() * 115;
        sx = Math.max(-185, Math.min(185, origin.x + Math.cos(ang) * dist));
        sy = Math.max(-185, Math.min(185, origin.y + Math.sin(ang) * dist));
        sz = 0;
      }

      // Compute true string vector from stain BACK to origin
      const vx = origin.x - sx;
      const vy = origin.y - sy;
      const vz = origin.z - sz;
      const horiz = Math.hypot(vx, vy);
      let trueAz = (Math.atan2(vy, vx) * 180) / Math.PI;
      if (trueAz < 0) trueAz += 360;
      const trueEl = Math.max(8, Math.min(84, (Math.atan2(vz, horiz) * 180) / Math.PI));

      // Simulate realistic stain W & L measurements
      const wMm = +(8 + rand() * 4).toFixed(1);
      const lMm = +(wMm / Math.sin((trueEl * Math.PI) / 180)).toFixed(1);

      stains.push({
        id: `S${stains.length + 1}`,
        x: Math.round(sx),
        y: Math.round(sy),
        z: Math.round(sz),
        surface: onWall ? "Back Wall" : "Floor",
        wMm,
        lMm,
        trueAz: Math.round(trueAz),
        trueEl: Math.round(trueEl),
        string: null // { az, el }
      });
    }
    return stains;
  }

  function loadScene(key) {
    const sbBox = document.getElementById("sandboxOriginControls");
    sbBox.classList.toggle("hidden", key !== "sandbox");

    if (key === "case1") {
      roomState.trueOrigins = [{ x: -25, y: 15, z: 145, label: "Standing (~145 cm)" }];
      roomState.stains = generateStainsFromOrigin(roomState.trueOrigins[0], 7, 101, true);
    } else if (key === "case2") {
      roomState.trueOrigins = [{ x: 35, y: -30, z: 82, label: "Kneeling / Bench (~82 cm)" }];
      roomState.stains = generateStainsFromOrigin(roomState.trueOrigins[0], 7, 202, true);
    } else if (key === "case3") {
      const o1 = { x: -70, y: -40, z: 140, label: "Event A (Standing)" };
      const o2 = { x: 65, y: 30, z: 30, label: "Event B (Floor Impact)" };
      roomState.trueOrigins = [o1, o2];
      const s1 = generateStainsFromOrigin(o1, 4, 301, false);
      const s2 = generateStainsFromOrigin(o2, 4, 405, false).map((s, idx) => ({
        ...s,
        id: `S${idx + 5}`
      }));
      roomState.stains = [...s1, ...s2];
    } else {
      const ox = parseInt(document.getElementById("sbOriginX").value, 10);
      const oy = parseInt(document.getElementById("sbOriginY").value, 10);
      const oz = parseInt(document.getElementById("sbOriginZ").value, 10);
      roomState.trueOrigins = [{ x: ox, y: oy, z: oz, label: "Custom Origin" }];
      roomState.stains = generateStainsFromOrigin(roomState.trueOrigins[0], 7, Date.now() % 9999, true);
    }
    roomState.selectedId = null;
    document.getElementById("hypothesisFeedback").textContent = "";
    updateSelectedStainUI();
    updateConvergenceReadout();
    drawStringRoom();
  }

  document.getElementById("sceneSelect").addEventListener("change", (e) => loadScene(e.target.value));
  ["sbOriginX", "sbOriginY", "sbOriginZ"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      document.getElementById("sbXVal").textContent = document.getElementById("sbOriginX").value;
      document.getElementById("sbYVal").textContent = document.getElementById("sbOriginY").value;
      document.getElementById("sbZVal").textContent = document.getElementById("sbOriginZ").value;
    });
  });
  document.getElementById("btnGenerateSandbox").addEventListener("click", () => loadScene("sandbox"));

  document.getElementById("btnResetCamera").addEventListener("click", () => {
    roomState.yaw = 0.65;
    roomState.pitch = 0.45;
    roomState.zoom = 1.55;
    drawStringRoom();
  });

  const azSlider = document.getElementById("stringAzimuth");
  const elSlider = document.getElementById("stringElevation");
  azSlider.addEventListener("input", () => {
    document.getElementById("stringAzimuthVal").textContent = `${azSlider.value}°`;
  });
  elSlider.addEventListener("input", () => {
    document.getElementById("stringElevationVal").textContent = `${elSlider.value}°`;
  });

  document.getElementById("btnAttachString").addEventListener("click", () => {
    const stain = roomState.stains.find((s) => s.id === roomState.selectedId);
    if (!stain) return;
    stain.string = {
      az: parseInt(azSlider.value, 10),
      el: parseInt(elSlider.value, 10)
    };
    updateConvergenceReadout();
    drawStringRoom();
  });

  document.getElementById("btnSnapCalculated").addEventListener("click", () => {
    const stain = roomState.stains.find((s) => s.id === roomState.selectedId);
    if (!stain) return;
    const calcEl = Math.round((Math.asin(Math.min(1, stain.wMm / stain.lMm)) * 180) / Math.PI);
    azSlider.value = stain.trueAz;
    elSlider.value = calcEl;
    document.getElementById("stringAzimuthVal").textContent = `${stain.trueAz}°`;
    document.getElementById("stringElevationVal").textContent = `${calcEl}°`;
    stain.string = { az: stain.trueAz, el: calcEl };
    updateConvergenceReadout();
    drawStringRoom();
  });

  document.getElementById("btnRemoveString").addEventListener("click", () => {
    const stain = roomState.stains.find((s) => s.id === roomState.selectedId);
    if (!stain) return;
    stain.string = null;
    updateConvergenceReadout();
    drawStringRoom();
  });

  document.getElementById("btnAutoStringAll").addEventListener("click", () => {
    roomState.stains.forEach((s) => {
      const calcEl = Math.round((Math.asin(Math.min(1, s.wMm / s.lMm)) * 180) / Math.PI);
      s.string = { az: s.trueAz, el: calcEl };
    });
    updateConvergenceReadout();
    drawStringRoom();
  });

  document.getElementById("btnClearStrings").addEventListener("click", () => {
    roomState.stains.forEach((s) => (s.string = null));
    updateConvergenceReadout();
    drawStringRoom();
  });

  document.getElementById("btnTestHypothesis").addEventListener("click", () => {
    const est = compute3DConvergence(roomState.stains.filter((s) => s.string));
    const fb = document.getElementById("hypothesisFeedback");
    if (!est) {
      fb.style.color = "#f59e0b";
      fb.textContent = "Attach at least 2 strings first to test a height hypothesis.";
      return;
    }
    const targetHeights = { standing: 145, kneeling: 80, table: 90, floor: 20 };
    const chosen = document.getElementById("hypothesisSelect").value;
    const diff = Math.abs(est.point.z - targetHeights[chosen]);
    if (diff <= 22) {
      fb.style.color = palette().good;
      fb.textContent = `Consistent! Reconstructed Z = ${est.point.z.toFixed(0)} cm aligns with ${chosen}.`;
    } else {
      fb.style.color = "#f59e0b";
      fb.textContent = `Not supported: strings converge around Z = ${est.point.z.toFixed(0)} cm.`;
    }
  });

  function updateSelectedStainUI() {
    const box = document.getElementById("selectedStainInfo");
    const stain = roomState.stains.find((s) => s.id === roomState.selectedId);
    if (!stain) {
      box.innerHTML = "<strong>Selected Stain:</strong> None — click a stain in the 3D room.";
      return;
    }
    const ratio = (stain.wMm / stain.lMm).toFixed(2);
    const calcEl = Math.round((Math.asin(Math.min(1, stain.wMm / stain.lMm)) * 180) / Math.PI);
    if (stain.string) {
      azSlider.value = stain.string.az;
      elSlider.value = stain.string.el;
      document.getElementById("stringAzimuthVal").textContent = `${stain.string.az}°`;
      document.getElementById("stringElevationVal").textContent = `${stain.string.el}°`;
    }
    box.innerHTML = `
      <strong>Stain ${stain.id} (${stain.surface})</strong> at (${stain.x}, ${stain.y}, ${stain.z}) cm<br>
      Width: ${stain.wMm} mm | Length: ${stain.lMm} mm (W/L = ${ratio})<br>
      ${
        state.gradeLevel === "ms"
          ? `Estimated Elevation: <strong>~${calcEl}°</strong> | Tail points away from ${stain.trueAz}°`
          : `$\\theta = \\arcsin(${stain.wMm}/${stain.lMm}) =$ <strong>${calcEl}°</strong> | Back-Azimuth: ${stain.trueAz}°`
      }
    `;
  }

  // Least-squares 3D line intersection for any active strings
  function compute3DConvergence(strungStains) {
    if (strungStains.length < 2) return null;
    // Solve sum(I - u u^T) p = sum(I - u u^T) s
    const M = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    const b = [0, 0, 0];

    strungStains.forEach((s) => {
      const az = (s.string.az * Math.PI) / 180;
      const el = (s.string.el * Math.PI) / 180;
      const u = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
      const p0 = [s.x, s.y, s.z];

      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const Pij = (i === j ? 1 : 0) - u[i] * u[j];
          M[i][j] += Pij;
          b[i] += Pij * p0[j];
        }
      }
    });

    const p = solve3x3(M, b);
    if (!p) return null;

    // RMS distance from point p to each string
    let sumSq = 0;
    strungStains.forEach((s) => {
      const az = (s.string.az * Math.PI) / 180;
      const el = (s.string.el * Math.PI) / 180;
      const ux = Math.cos(el) * Math.cos(az);
      const uy = Math.cos(el) * Math.sin(az);
      const uz = Math.sin(el);
      const dx = p[0] - s.x;
      const dy = p[1] - s.y;
      const dz = p[2] - s.z;
      const proj = dx * ux + dy * uy + dz * uz;
      const rx = dx - proj * ux;
      const ry = dy - proj * uy;
      const rz = dz - proj * uz;
      sumSq += rx * rx + ry * ry + rz * rz;
    });

    return {
      point: { x: p[0], y: p[1], z: p[2] },
      rms: Math.sqrt(sumSq / strungStains.length)
    };
  }

  function solve3x3(A, b) {
    const M = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < 3; i++) {
      let maxR = i;
      for (let r = i + 1; r < 3; r++) {
        if (Math.abs(M[r][i]) > Math.abs(M[maxR][i])) maxR = r;
      }
      [M[i], M[maxR]] = [M[maxR], M[i]];
      if (Math.abs(M[i][i]) < 1e-6) return null;
      const div = M[i][i];
      for (let j = i; j < 4; j++) M[i][j] /= div;
      for (let r = 0; r < 3; r++) {
        if (r === i) continue;
        const factor = M[r][i];
        for (let j = i; j < 4; j++) M[r][j] -= factor * M[i][j];
      }
    }
    return [M[0][3], M[1][3], M[2][3]];
  }

  function updateConvergenceReadout() {
    const box = document.getElementById("convergenceReadout");
    const strung = roomState.stains.filter((s) => s.string);
    const est = compute3DConvergence(strung);
    if (!est) {
      box.innerHTML = `<strong>3D Convergence:</strong> ${strung.length} string(s) attached. Need at least 2.`;
      return;
    }
    const { point, rms } = est;
    const extraNote =
      rms > 25 && roomState.trueOrigins.length > 1
        ? "<br><em>High error! Could there be TWO separate impact events in this room?</em>"
        : "";
    box.innerHTML = `
      <strong>Estimated Point of Origin (${strung.length} strings):</strong><br>
      Area of Convergence (Floor X, Y): <strong>(${point.x.toFixed(0)}, ${point.y.toFixed(0)}) cm</strong><br>
      Origin Height (Z): <strong>${Math.max(0, point.z).toFixed(0)} cm</strong><br>
      Convergence Spread (RMS): ±${rms.toFixed(1)} cm ${extraNote}
    `;
  }

  function project3D(x, y, z) {
    const cosY = Math.cos(roomState.yaw);
    const sinY = Math.sin(roomState.yaw);
    const cosP = Math.cos(roomState.pitch);
    const sinP = Math.sin(roomState.pitch);

    // Center Z around 80cm for nice framing
    const zc = z - 75;
    const x1 = x * cosY - y * sinY;
    const y1 = x * sinY + y * cosY;

    const y2 = y1 * cosP - zc * sinP;
    const z2 = y1 * sinP + zc * cosP;

    const dist = 700;
    const scale = (dist / (dist + y2)) * roomState.zoom;
    return {
      x: stringCanvas.width / 2 + x1 * scale,
      y: stringCanvas.height / 2 - z2 * scale,
      scale,
      depth: y2
    };
  }

  function drawLine3D(ctx, p1, p2, color, width = 1, dash = []) {
    const a = project3D(p1[0], p1[1], p1[2]);
    const b = project3D(p2[0], p2[1], p2[2]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawStringRoom() {
    const pal = palette();
    sCtx.fillStyle = "#080c12";
    sCtx.fillRect(0, 0, stringCanvas.width, stringCanvas.height);

    // Floor grid (-200..200)
    for (let g = -200; g <= 200; g += 50) {
      drawLine3D(sCtx, [g, -200, 0], [g, 200, 0], "#192434", g === 0 ? 1.5 : 1);
      drawLine3D(sCtx, [-200, g, 0], [200, g, 0], "#192434", g === 0 ? 1.5 : 1);
    }

    // Back wall (Y = 200, Z = 0..200) and Left wall (X = -200)
    drawLine3D(sCtx, [-200, 200, 0], [-200, 200, 200], "#324660", 1.5);
    drawLine3D(sCtx, [200, 200, 0], [200, 200, 200], "#324660", 1.5);
    drawLine3D(sCtx, [-200, 200, 200], [200, 200, 200], "#324660", 1.5);
    drawLine3D(sCtx, [-200, -200, 0], [-200, -200, 200], "#26354a", 1);
    drawLine3D(sCtx, [-200, -200, 200], [-200, 200, 200], "#26354a", 1);

    // Wall height ruler ticks
    for (let z = 50; z <= 150; z += 50) {
      drawLine3D(sCtx, [-200, 200, z], [200, 200, z], "#172230", 1, [4, 4]);
    }

    // Draw 2D convergence floor projections + 3D red strings
    const strung = roomState.stains.filter((s) => s.string);
    strung.forEach((s) => {
      const az = (s.string.az * Math.PI) / 180;
      const el = (s.string.el * Math.PI) / 180;
      const len = 300;
      const ex = s.x + len * Math.cos(el) * Math.cos(az);
      const ey = s.y + len * Math.cos(el) * Math.sin(az);
      const ez = s.z + len * Math.sin(el);

      // 2D Floor convergence trace
      if (s.surface === "Floor") {
        drawLine3D(
          sCtx,
          [s.x, s.y, 0],
          [s.x + 260 * Math.cos(az), s.y + 260 * Math.sin(az), 0],
          "rgba(56, 189, 248, 0.35)",
          1,
          [5, 4]
        );
      }
      // 3D Red String
      drawLine3D(sCtx, [s.x, s.y, s.z], [ex, ey, ez], pal.string, 2);
    });

    // Draw 3D Point of Origin marker if >= 2 strings
    const est = compute3DConvergence(strung);
    if (est && est.point.z >= -10 && est.point.z <= 260) {
      const p = est.point;
      const pz = Math.max(0, p.z);
      drawLine3D(sCtx, [p.x, p.y, 0], [p.x, p.y, pz], pal.good, 1.5, [3, 3]);
      const proj = project3D(p.x, p.y, pz);
      sCtx.fillStyle = pal.good;
      sCtx.beginPath();
      sCtx.arc(proj.x, proj.y, 7, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.fillStyle = "#fff";
      sCtx.font = "bold 11px system-ui";
      sCtx.fillText(`Origin (${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${pz.toFixed(0)})`, proj.x + 10, proj.y - 6);
    }

    // Draw stains and store projected coordinates for click detection
    roomState.screenStains = [];
    roomState.stains.forEach((s) => {
      const proj = project3D(s.x, s.y, s.z);
      roomState.screenStains.push({ id: s.id, x: proj.x, y: proj.y });

      const isSel = s.id === roomState.selectedId;
      sCtx.fillStyle = pal.stain;
      sCtx.strokeStyle = isSel ? pal.accent : pal.stainEdge;
      sCtx.lineWidth = isSel ? 2.5 : 1;
      sCtx.beginPath();
      sCtx.arc(proj.x, proj.y, isSel ? 8 : 6, 0, Math.PI * 2);
      sCtx.fill();
      sCtx.stroke();

      sCtx.fillStyle = isSel ? pal.accent : "#cbd5e1";
      sCtx.font = isSel ? "bold 12px system-ui" : "10px system-ui";
      sCtx.fillText(s.id, proj.x + 9, proj.y + 4);
    });
  }

  stringCanvas.addEventListener("pointerdown", (e) => {
    roomState.dragging = true;
    roomState.dragMoved = false;
    roomState.lastMouse = getCanvasCoords(stringCanvas, e);
  });

  stringCanvas.addEventListener("pointermove", (e) => {
    if (!roomState.dragging) return;
    const pos = getCanvasCoords(stringCanvas, e);
    const dx = pos.x - roomState.lastMouse.x;
    const dy = pos.y - roomState.lastMouse.y;
    if (Math.hypot(dx, dy) > 3) roomState.dragMoved = true;

    roomState.yaw += dx * 0.008;
    roomState.pitch = Math.max(0.1, Math.min(1.35, roomState.pitch + dy * 0.008));
    roomState.lastMouse = pos;
    drawStringRoom();
  });

  window.addEventListener("pointerup", (e) => {
    if (!roomState.dragging) return;
    const wasClick = !roomState.dragMoved;
    roomState.dragging = false;
    if (wasClick && e.target === stringCanvas) {
      const pos = getCanvasCoords(stringCanvas, e);
      let closest = null;
      let bestDist = 22;
      roomState.screenStains.forEach((sc) => {
        const d = Math.hypot(sc.x - pos.x, sc.y - pos.y);
        if (d < bestDist) {
          bestDist = d;
          closest = sc.id;
        }
      });
      if (closest) {
        roomState.selectedId = closest;
        updateSelectedStainUI();
        drawStringRoom();
      }
    }
  });

  // =========================================================
  // MODULE 4: MOTION & VELOCITY SANDBOX
  // =========================================================
  const motionCanvas = document.getElementById("motionCanvas");
  const mCtx = motionCanvas.getContext("2d");
  const motionType = document.getElementById("motionType");
  const walkSpeed = document.getElementById("walkSpeed");
  const impactEnergy = document.getElementById("impactEnergy");

  motionType.addEventListener("change", () => {
    const isDrip = motionType.value === "drip";
    document.getElementById("dripControls").classList.toggle("hidden", !isDrip);
    document.getElementById("impactControls").classList.toggle("hidden", isDrip);
    drawMotionModule();
  });

  walkSpeed.addEventListener("input", () => {
    const v = parseFloat(walkSpeed.value);
    const label = v === 0 ? "Stationary" : v < 1.8 ? "Walking" : v < 2.8 ? "Brisk Jog" : "Running";
    document.getElementById("walkSpeedVal").textContent = `${v.toFixed(1)} m/s (${label})`;
  });

  document.getElementById("btnRunMotion").addEventListener("click", drawMotionModule);

  function drawMotionModule() {
    drawGrid(mCtx, motionCanvas, 35);
    const pal = palette();

    if (motionType.value === "drip") {
      const v = parseFloat(walkSpeed.value);
      const spacingPx = 18 + v * 48;
      const tailStretch = 1 + v * 0.45;
      const count = v === 0 ? 1 : Math.floor((motionCanvas.width - 120) / spacingPx);

      mCtx.fillStyle = pal.stain;
      for (let i = 0; i < count; i++) {
        const x = 80 + i * spacingPx;
        const y = motionCanvas.height / 2 + Math.sin(i * 1.4) * (v > 0 ? 12 : 0);
        mCtx.beginPath();
        mCtx.ellipse(x, y, 11 * tailStretch, 10, 0, 0, Math.PI * 2);
        mCtx.fill();

        if (v > 1.2) {
          mCtx.beginPath();
          mCtx.arc(x + 15 * tailStretch, y, 3, 0, Math.PI * 2);
          mCtx.fill();
        }
      }
      document.getElementById("motionReadout").innerHTML = `
        <strong>Drip Trail (${v.toFixed(1)} m/s):</strong><br>
        ${
          v === 0
            ? "Stationary dripping creates a concentrated pool with overlapping drops."
            : `Drops are spaced every ~${(v * 0.35).toFixed(2)} m, with tails pointing right (direction of movement).`
        }
      `;
    } else {
      const level = impactEnergy.value;
      const cfg = {
        low: { count: 14, minR: 7, maxR: 15, spread: 130, text: "Low Velocity: Large droplets (>4 mm), small total area." },
        medium: { count: 65, minR: 2.5, maxR: 7, spread: 190, text: "Medium Velocity: Typical 1–4 mm droplets radiating outward." },
        high: { count: 220, minR: 0.9, maxR: 2.8, spread: 220, text: "High Velocity: Mist-like fine droplets (<1 mm) over a wide cone." }
      }[level];

      const rand = mulberry32(level.length * 777);
      const cx = motionCanvas.width / 2;
      const cy = motionCanvas.height / 2;
      mCtx.fillStyle = pal.stain;

      for (let i = 0; i < cfg.count; i++) {
        const a = rand() * Math.PI * 2;
        const dist = Math.pow(rand(), 0.7) * cfg.spread;
        const r = cfg.minR + rand() * (cfg.maxR - cfg.minR);
        mCtx.beginPath();
        mCtx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, r, 0, Math.PI * 2);
        mCtx.fill();
      }
      document.getElementById("motionReadout").innerHTML = `<strong>${level.toUpperCase()} Energy:</strong> ${cfg.text}`;
    }
  }

  // =========================================================
  // MODULE 5: BIAS & FORENSIC ETHICS LAB
  // =========================================================
  const biasCanvas = document.getElementById("biasCanvas");
  const bCtx = biasCanvas.getContext("2d");

  // True Origin is at (500, 220) — "Lab Station B"
  // Biased hunch assumes (210, 230) — "Lab Station A"
  const biasStains = [
    { id: 1, x: 350, y: 120, tx: 500, ty: 220, active: true, biasedPick: true },
    { id: 2, x: 320, y: 310, tx: 500, ty: 220, active: true, biasedPick: true },
    { id: 3, x: 420, y: 80, tx: 500, ty: 220, active: true, biasedPick: false },
    { id: 4, x: 610, y: 125, tx: 500, ty: 220, active: true, biasedPick: false },
    { id: 5, x: 640, y: 290, tx: 500, ty: 220, active: true, biasedPick: false },
    { id: 6, x: 480, y: 370, tx: 500, ty: 220, active: true, biasedPick: false },
    { id: 7, x: 370, y: 245, tx: 500, ty: 220, active: true, biasedPick: true },
    { id: 8, x: 560, y: 350, tx: 500, ty: 220, active: true, biasedPick: false }
  ];

  // Add slight noise to biasedPick stains so selecting ONLY those 3 intersects near Station A!
  biasStains[0].angle = Math.atan2(biasStains[0].y - 230, biasStains[0].x - 210);
  biasStains[1].angle = Math.atan2(biasStains[1].y - 230, biasStains[1].x - 210);
  biasStains[6].angle = Math.atan2(biasStains[6].y - 220, biasStains[6].x - 500);
  [2, 3, 4, 5, 7].forEach((idx) => {
    const s = biasStains[idx];
    s.angle = Math.atan2(s.y - s.ty, s.x - s.tx);
  });

  document.getElementById("btnSelectBiased3").addEventListener("click", () => {
    biasStains.forEach((s) => (s.active = s.biasedPick));
    drawBiasModule();
  });

  document.getElementById("btnSelectAll8").addEventListener("click", () => {
    biasStains.forEach((s) => (s.active = true));
    drawBiasModule();
  });

  biasCanvas.addEventListener("pointerdown", (e) => {
    const pos = getCanvasCoords(biasCanvas, e);
    biasStains.forEach((s) => {
      if (Math.hypot(s.x - pos.x, s.y - pos.y) < 18) {
        s.active = !s.active;
      }
    });
    drawBiasModule();
  });

  function drawBiasModule() {
    drawGrid(bCtx, biasCanvas, 35);
    const pal = palette();

    // Draw Station A ("Hunch") & Station B ("Objective Truth")
    bCtx.strokeStyle = "#f59e0b";
    bCtx.strokeRect(185, 205, 50, 50);
    bCtx.fillStyle = "#f59e0b";
    bCtx.font = "12px system-ui";
    bCtx.fillText("Station A (Hunch)", 160, 195);

    bCtx.strokeStyle = pal.good;
    bCtx.strokeRect(475, 195, 50, 50);
    bCtx.fillStyle = pal.good;
    bCtx.fillText("Station B (Actual Source)", 445, 185);

    const active = biasStains.filter((s) => s.active);
    active.forEach((s) => {
      bCtx.strokeStyle = pal.string;
      bCtx.lineWidth = 1.5;
      bCtx.setLineDash([5, 4]);
      bCtx.beginPath();
      bCtx.moveTo(s.x, s.y);
      bCtx.lineTo(s.x - Math.cos(s.angle) * 420, s.y - Math.sin(s.angle) * 420);
      bCtx.stroke();
      bCtx.setLineDash([]);
    });

    biasStains.forEach((s) => {
      bCtx.save();
      bCtx.translate(s.x, s.y);
      bCtx.rotate(s.angle);
      bCtx.fillStyle = s.active ? pal.stain : "#334155";
      bCtx.strokeStyle = s.active ? pal.stainEdge : "#64748b";
      bCtx.beginPath();
      bCtx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      bCtx.fill();
      bCtx.stroke();
      bCtx.restore();
    });

    const onlyBiased = active.length === 3 && active.every((s) => s.biasedPick);
    const box = document.getElementById("biasReadout");
    if (onlyBiased) {
      box.innerHTML = `
        <strong style="color:#f59e0b;">Confirmation Bias Alert!</strong><br>
        By ignoring 5 stains and cherry-picking only 3, the lines falsely point toward <strong>Station A</strong>!
      `;
    } else if (active.length === 8) {
      box.innerHTML = `
        <strong style="color:${pal.good};">Objective Analysis (All 8 Stains):</strong><br>
        The majority of evidence clearly converges at <strong>Station B</strong>, exposing why the initial hunch was flawed.
      `;
    } else {
      box.innerHTML = `<strong>${active.length} of 8 stains active.</strong> Compare cherry-picked evidence vs. complete data.`;
    }
  }

  function redrawAll() {
    drawDropModule();
    drawAngleModule();
    drawStringRoom();
    drawMotionModule();
    drawBiasModule();
  }

  // Initialize
  loadScene("case1");
  redrawAll();
})();
