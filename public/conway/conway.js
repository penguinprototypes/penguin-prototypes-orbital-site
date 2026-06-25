(() => {
  "use strict";

  const GRID_SIZE = 50;
  const CELL_COUNT = GRID_SIZE * GRID_SIZE;
  const INITIAL_PATTERN_SIZE = 10;
  const INITIAL_LIVE_CHANCE = 0.34;
  const TICK_MS = 100;
  const STABLE_RESET_DELAY = 2;
  const INTRO_FADE_DELAY_MS = 90;
  const INTRO_FADE_DURATION_MS = 1450;
  const MAP_SIM_TICK_MS = 120;
  const MAP_VISIBLE_RUN_LIMIT = 640;

  const root = document.documentElement;
  const stars = document.getElementById("stars");

  const canvas = document.getElementById("universe-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;
  const image = ctx.createImageData(GRID_SIZE, GRID_SIZE);

  const frameEl = document.getElementById("universe-frame");
  const orbSvg = document.getElementById("neighbor-orb");
  const orbNodeLayer = document.getElementById("orb-node-layer");
  const orbLinkLayer = document.getElementById("orb-link-layer");
  const orbHoverLabel = document.getElementById("orb-hover-label");
  const orbCurrentRule = document.getElementById("orb-current-rule");

  const spaceMapOverlay = document.getElementById("space-map-overlay");
  const spaceMapCanvas = document.getElementById("space-map-canvas");
  const spaceMapCtx = spaceMapCanvas.getContext("2d", { alpha: false });
  spaceMapCtx.imageSmoothingEnabled = false;

  const ruleNameEl = document.getElementById("rule-name");
  const birthRangeEl = document.getElementById("birth-range");
  const survivalRangeEl = document.getElementById("survival-range");
  const groupNameEl = document.getElementById("group-name");
  const connectedIdEl = document.getElementById("connected-id");
  const generationEl = document.getElementById("generation");
  const liveCountEl = document.getElementById("live-count");
  const statusPill = document.getElementById("status-pill");
  const mapButton = document.getElementById("map-button");
  const mapCloseButton = document.getElementById("map-close-button");
  const mapCenterButton = document.getElementById("map-center-button");
  const randomButton = document.getElementById("random-button");
  const resetButton = document.getElementById("reset-button");
  const pauseButton = document.getElementById("pause-button");
  const jumpForm = document.getElementById("jump-form");
  const jumpInput = document.getElementById("jump-input");
  const jumpError = document.getElementById("jump-error");

  const cells = new Uint8Array(CELL_COUNT);
  const nextCells = new Uint8Array(CELL_COUNT);
  const ages = new Uint16Array(CELL_COUNT);
  const nextAges = new Uint16Array(CELL_COUNT);
  const neighbors = Array.from({ length: CELL_COUNT }, () => new Uint16Array(8));
  const connectedIntervals = buildConnectedIntervals();
  const thumbnailCache = new Map();
  const mapUniverseStates = new Map();

  let rule = { bStart: 3, bEnd: 3, sStart: 2, sEnd: 3 };
  let generation = 0;
  let stableTicks = 0;
  let lastTick = 0;
  let lastMapTick = 0;
  let paused = false;
  let pageHidden = document.hidden;
  let mapSeedSalt = Math.floor(Math.random() * 0xffffffff);

  let orbYaw = 0.38;
  let orbPitch = -0.2;
  let orbDragging = false;
  let orbMoved = false;
  let orbLastX = 0;
  let orbLastY = 0;
  let renderedOrbNodes = [];

  const mapView = {
    open: false,
    x: 0,
    y: 0,
    zoom: 1,
    dragging: false,
    moved: false,
    lastX: 0,
    lastY: 0,
    animating: false,
    animStartX: 0,
    animStartY: 0,
    animStartZoom: 1,
    animTargetX: 0,
    animTargetY: 0,
    animTargetZoom: 1,
    animStartTime: 0,
    animDuration: 620,
    pendingRule: null
  };

  const pointer = { targetX: 0, targetY: 0, x: 0, y: 0 };

  const connectedMoves = [
    { axis: "bStart", delta: -1, label: "Bₛ−", kind: "birth", pos: [-0.80, -0.22,  0.52] },
    { axis: "bStart", delta:  1, label: "Bₛ+", kind: "birth", pos: [ 0.80, -0.22,  0.52] },
    { axis: "bEnd",   delta: -1, label: "Bₑ−", kind: "birth", pos: [-0.26,  0.80,  0.42] },
    { axis: "bEnd",   delta:  1, label: "Bₑ+", kind: "birth", pos: [ 0.26,  0.80,  0.42] },
    { axis: "sStart", delta: -1, label: "Sₛ−", kind: "survival", pos: [-0.78,  0.24, -0.38] },
    { axis: "sStart", delta:  1, label: "Sₛ+", kind: "survival", pos: [ 0.78,  0.24, -0.38] },
    { axis: "sEnd",   delta: -1, label: "Sₑ−", kind: "survival", pos: [-0.26, -0.80, -0.28] },
    { axis: "sEnd",   delta:  1, label: "Sₑ+", kind: "survival", pos: [ 0.26, -0.80, -0.28] }
  ];

  prepareIntroShell();
  init();

  function prepareIntroShell() {
    document.documentElement.style.setProperty("--intro-black-fade-delay", `${INTRO_FADE_DELAY_MS}ms`);
    document.documentElement.style.setProperty("--intro-black-fade-duration", `${INTRO_FADE_DURATION_MS}ms`);
    document.body.classList.add("intro-pending", "intro-running");
  }

  function startIntroAnimation() {
    document.body.classList.add("intro-fade-running");

    window.setTimeout(() => {
      document.body.classList.remove("intro-pending", "intro-running", "intro-fade-running");
    }, INTRO_FADE_DELAY_MS + INTRO_FADE_DURATION_MS + 180);
  }

  function init() {
    precomputeNeighbors();
    generateRandomStarfield();
    resizeSpaceMapCanvas();
    attachButtonHandlers();
    attachPointerHandlers();
    attachOrbHandlers();
    attachSpaceMapHandlers();
    attachVisibilityHandlers();

    resetPattern();
    drawMainUniverse();
    centerMapOnCurrent();
    updateUi();

    startIntroAnimation();
    requestAnimationFrame(loop);
  }

  function attachButtonHandlers() {
    pauseButton.addEventListener("click", () => {
      paused = !paused;
      pauseButton.textContent = paused ? "Resume" : "Pause";
      statusPill.textContent = paused ? "paused" : "running";
      statusPill.classList.toggle("paused", paused);
    });

    resetButton.addEventListener("click", () => {
      mapSeedSalt = Math.floor(Math.random() * 0xffffffff);
      mapUniverseStates.clear();
      resetPattern();
      drawMainUniverse();
      updateUi();
    });

    randomButton.addEventListener("click", randomizeConnectedRule);

    mapButton.addEventListener("click", () => {
      transitionThroughBlack(() => {
        mapView.open = true;
        spaceMapOverlay.classList.add("active");
        spaceMapOverlay.setAttribute("aria-hidden", "false");
        resizeSpaceMapCanvas();
        centerMapOnCurrent();
        renderSpaceMap();
      });
    });

    mapCloseButton.addEventListener("click", () => {
      transitionThroughBlack(closeSpaceMapImmediate);
    });
    mapCenterButton.addEventListener("click", () => {
      glideMapToRule(rule, Math.max(mapView.zoom, 0.9));
    });

    jumpForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const parsed = parseConnectedInput(jumpInput.value);
      if (!parsed) {
        jumpError.textContent = "Use B3/S23, B678/S1234, or 3323.";
        return;
      }
      jumpError.textContent = "";
      setRule(parsed, true);
    });
  }

  function closeSpaceMap() {
    transitionThroughBlack(closeSpaceMapImmediate);
  }

  function closeSpaceMapImmediate() {
    mapView.open = false;
    spaceMapOverlay.style.transition = "none";
    spaceMapOverlay.classList.remove("active");
    spaceMapOverlay.setAttribute("aria-hidden", "true");
    void spaceMapOverlay.offsetWidth;
    spaceMapOverlay.style.transition = "";
  }

  function transitionThroughBlack(callback) {
    document.body.classList.add("transitioning");

    window.setTimeout(() => {
      callback();

      window.setTimeout(() => {
        document.body.classList.remove("transitioning");
      }, 150);
    }, 540);
  }

  function handleSpaceMapClick(clickedRule) {
    if (sameRule(clickedRule, rule)) {
      closeSpaceMap();
      return;
    }

    setRule(clickedRule, false);
    glideMapToRule(clickedRule, Math.max(mapView.zoom, 0.9));
  }

  function glideMapToRule(targetRule, targetZoom = mapView.zoom) {
    const target = mapCameraForRule(targetRule, targetZoom);

    mapView.animating = true;
    mapView.animStartX = mapView.x;
    mapView.animStartY = mapView.y;
    mapView.animStartZoom = mapView.zoom;
    mapView.animTargetX = target.x;
    mapView.animTargetY = target.y;
    mapView.animTargetZoom = target.zoom;
    mapView.animStartTime = performance.now();
  }

  function updateMapCameraAnimation(timestamp) {
    if (!mapView.animating) return;

    const t = clamp((timestamp - mapView.animStartTime) / mapView.animDuration, 0, 1);
    const eased = easeInOutCubic(t);

    mapView.x = lerp(mapView.animStartX, mapView.animTargetX, eased);
    mapView.y = lerp(mapView.animStartY, mapView.animTargetY, eased);
    mapView.zoom = lerp(mapView.animStartZoom, mapView.animTargetZoom, eased);

    if (t >= 1) {
      mapView.animating = false;
    }
  }

  function mapCameraForRule(targetRule, targetZoom = mapView.zoom) {
    const cluster = clusterWorldPosition(targetRule.bStart, targetRule.sStart);
    const localX = (targetRule.bEnd - targetRule.bStart) * (54 + 24);
    const localY = (targetRule.sEnd - targetRule.sStart) * (54 + 24);
    const worldX = cluster.x + localX + 27;
    const worldY = cluster.y + localY + 27;

    return {
      zoom: targetZoom,
      x: window.innerWidth / 2 - worldX * targetZoom,
      y: window.innerHeight / 2 - worldY * targetZoom
    };
  }

  function sameRule(a, b) {
    return (
      a.bStart === b.bStart &&
      a.bEnd === b.bEnd &&
      a.sStart === b.sStart &&
      a.sEnd === b.sEnd
    );
  }

  function easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function attachPointerHandlers() {
    window.addEventListener("pointermove", (event) => {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const nx = (event.clientX / w) * 2 - 1;
      const ny = (event.clientY / h) * 2 - 1;

      pointer.targetX = clamp(nx, -1, 1) * 12;
      pointer.targetY = clamp(ny, -1, 1) * 8;
    }, { passive: true });

    window.addEventListener("pointerleave", () => {
      pointer.targetX = 0;
      pointer.targetY = 0;
    }, { passive: true });
  }

  function attachOrbHandlers() {
    orbSvg.addEventListener("pointerdown", (event) => {
      orbDragging = true;
      orbMoved = false;
      orbLastX = event.clientX;
      orbLastY = event.clientY;
      orbSvg.classList.add("dragging");
      orbSvg.setPointerCapture(event.pointerId);
    });

    orbSvg.addEventListener("pointermove", (event) => {
      const point = svgPointFromEvent(event);
      updateOrbHover(point);

      if (!orbDragging) return;

      const dx = event.clientX - orbLastX;
      const dy = event.clientY - orbLastY;

      if (Math.abs(dx) + Math.abs(dy) > 4) orbMoved = true;

      orbYaw += dx * 0.012;
      orbPitch = clamp(orbPitch - dy * 0.012, -1.1, 1.1);

      orbLastX = event.clientX;
      orbLastY = event.clientY;

      renderOrb();
    });

    orbSvg.addEventListener("pointerup", (event) => {
      const point = svgPointFromEvent(event);
      const hit = hitTestOrb(point);

      orbDragging = false;
      orbSvg.classList.remove("dragging");

      try { orbSvg.releasePointerCapture(event.pointerId); } catch {}

      if (!orbMoved && hit && hit.valid) {
        setRule(hit.candidate, true);
      }

      orbMoved = false;
    });

    orbSvg.addEventListener("pointerleave", () => {
      orbHoverLabel.textContent = "Click a nearby rule to jump there.";
      clearOrbHot();
    });

    orbSvg.addEventListener("pointercancel", () => {
      orbDragging = false;
      orbMoved = false;
      orbSvg.classList.remove("dragging");
    });
  }

  function attachSpaceMapHandlers() {
    spaceMapCanvas.addEventListener("pointerdown", (event) => {
      mapView.animating = false;
      mapView.dragging = true;
      mapView.moved = false;
      mapView.lastX = event.clientX;
      mapView.lastY = event.clientY;
      spaceMapCanvas.classList.add("dragging");
      spaceMapCanvas.setPointerCapture(event.pointerId);
    });

    spaceMapCanvas.addEventListener("pointermove", (event) => {
      if (!mapView.dragging) return;

      const dx = event.clientX - mapView.lastX;
      const dy = event.clientY - mapView.lastY;

      if (Math.abs(dx) + Math.abs(dy) > 3) mapView.moved = true;

      mapView.x += dx;
      mapView.y += dy;
      mapView.lastX = event.clientX;
      mapView.lastY = event.clientY;
      renderSpaceMap();
    });

    spaceMapCanvas.addEventListener("pointerup", (event) => {
      mapView.dragging = false;
      spaceMapCanvas.classList.remove("dragging");

      try { spaceMapCanvas.releasePointerCapture(event.pointerId); } catch {}

      if (!mapView.moved) {
        const hit = hitTestSpaceMap(event.clientX, event.clientY);
        if (hit) {
          handleSpaceMapClick(hit.rule);
        }
      }

      mapView.moved = false;
    });

    spaceMapCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();

      const rect = spaceMapCanvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const before = screenToWorld(px, py);

      const factor = event.deltaY > 0 ? 0.88 : 1.14;
      mapView.zoom = clamp(mapView.zoom * factor, 0.28, 3.8);

      const afterScreen = worldToScreen(before.x, before.y);
      mapView.x += px - afterScreen.x;
      mapView.y += py - afterScreen.y;

      renderSpaceMap();
    }, { passive: false });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mapView.open) closeSpaceMap();
    });
  }

  function attachVisibilityHandlers() {
    document.addEventListener("visibilitychange", () => {
      pageHidden = document.hidden;
      lastTick = 0;
    });

    window.addEventListener("resize", debounce(() => {
      generateRandomStarfield();
      resizeSpaceMapCanvas();
      if (mapView.open) {
      updateMapCameraAnimation(timestamp);

      if (timestamp - lastMapTick >= MAP_SIM_TICK_MS) {
        lastMapTick = timestamp;
        stepVisibleMapUniverses();
      }
      renderSpaceMap();
    }
    }, 180));
  }

  function loop(timestamp) {
    requestAnimationFrame(loop);
    updateParallax();

    if (pageHidden) return;

    if (!paused && timestamp - lastTick >= TICK_MS) {
      lastTick = timestamp;
      stepMainUniverse();
      drawMainUniverse();
      updateLiveStats();
    }

    if (mapView.open) {
      updateMapCameraAnimation(timestamp);

      if (timestamp - lastMapTick >= MAP_SIM_TICK_MS) {
        lastMapTick = timestamp;
        stepVisibleMapUniverses();
      }
      renderSpaceMap();
    }
  }

  function updateParallax() {
    pointer.x = lerp(pointer.x, pointer.targetX, 0.08);
    pointer.y = lerp(pointer.y, pointer.targetY, 0.08);
    root.style.setProperty("--px", `${pointer.x}px`);
    root.style.setProperty("--py", `${pointer.y}px`);
    root.style.setProperty("--stars-x", `${pointer.x * 0.55}px`);
    root.style.setProperty("--stars-y", `${pointer.y * 0.55}px`);
  }

  function generateRandomStarfield() {
    if (!stars) return;

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const count = 280;
    const rects = [];

    for (let i = 0; i < count; i += 1) {
      const size = randomRange(1, 2.2);
      const x = randomRange(0, width);
      const y = randomRange(0, height);
      const opacity = randomRange(0.20, 0.92);
      rects.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" rx="${(size / 2).toFixed(2)}" fill="white" opacity="${opacity.toFixed(3)}"/>`);
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects.join("")}</svg>`;
    stars.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    stars.style.backgroundSize = `${width}px ${height}px`;
    stars.style.backgroundRepeat = "no-repeat";
    stars.style.backgroundPosition = "center center";
  }

  function resizeSpaceMapCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h = window.innerHeight;
    spaceMapCanvas.width = Math.floor(w * dpr);
    spaceMapCanvas.height = Math.floor(h * dpr);
    spaceMapCanvas.style.width = `${w}px`;
    spaceMapCanvas.style.height = `${h}px`;
    spaceMapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    spaceMapCtx.imageSmoothingEnabled = false;
  }

  function idx(x, y) {
    x = ((x % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
    y = ((y % GRID_SIZE) + GRID_SIZE) % GRID_SIZE;
    return y * GRID_SIZE + x;
  }

  function precomputeNeighbors() {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const i = idx(x, y);
        let k = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            neighbors[i][k] = idx(x + dx, y + dy);
            k += 1;
          }
        }
      }
    }
  }

  function resetPattern() {
    cells.fill(0);
    nextCells.fill(0);
    ages.fill(0);
    nextAges.fill(0);

    const start = Math.floor((GRID_SIZE - INITIAL_PATTERN_SIZE) / 2);
    for (let y = start; y < start + INITIAL_PATTERN_SIZE; y += 1) {
      for (let x = start; x < start + INITIAL_PATTERN_SIZE; x += 1) {
        const i = idx(x, y);
        if (Math.random() < INITIAL_LIVE_CHANCE) {
          cells[i] = 1;
          ages[i] = 0;
        }
      }
    }

    generation = 0;
    stableTicks = 0;
    animateGrow();
  }

  function stepMainUniverse() {
    const changed = stepCells(rule, cells, nextCells, ages, nextAges);
    generation += 1;

    if (changed) stableTicks = 0;
    else stableTicks += 1;

    if (stableTicks >= STABLE_RESET_DELAY) resetPattern();
  }

  function stepCells(ruleObject, cellBuffer, nextCellBuffer, ageBuffer, nextAgeBuffer) {
    let changed = false;

    for (let i = 0; i < CELL_COUNT; i += 1) {
      const neighborCount = countNeighborsFrom(cellBuffer, i);
      const alive = cellBuffer[i] === 1;
      let nextAlive = 0;

      if (alive) nextAlive = neighborCount >= ruleObject.sStart && neighborCount <= ruleObject.sEnd ? 1 : 0;
      else nextAlive = neighborCount >= ruleObject.bStart && neighborCount <= ruleObject.bEnd ? 1 : 0;

      nextCellBuffer[i] = nextAlive;

      if (nextAlive) nextAgeBuffer[i] = alive ? Math.min(65535, ageBuffer[i] + 1) : 0;
      else nextAgeBuffer[i] = 0;

      if (nextAlive !== cellBuffer[i]) changed = true;
    }

    cellBuffer.set(nextCellBuffer);
    ageBuffer.set(nextAgeBuffer);
    return changed;
  }

  function countNeighborsFrom(cellBuffer, i) {
    const list = neighbors[i];
    return cellBuffer[list[0]] + cellBuffer[list[1]] + cellBuffer[list[2]] + cellBuffer[list[3]] +
      cellBuffer[list[4]] + cellBuffer[list[5]] + cellBuffer[list[6]] + cellBuffer[list[7]];
  }

  function drawMainUniverse() {
    const data = image.data;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const o = i * 4;
      if (cells[i]) {
        const color = colorForAge(ages[i]);
        data[o] = color[0];
        data[o + 1] = color[1];
        data[o + 2] = color[2];
        data[o + 3] = 255;
      } else {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function colorForAge(age) {
    const stops = [
      [0, [255, 255, 255]],
      [8, [255, 0, 0]],
      [16, [255, 128, 0]],
      [32, [255, 255, 0]],
      [64, [0, 255, 0]],
      [128, [0, 255, 255]],
      [256, [0, 96, 255]],
      [512, [180, 0, 255]],
      [1024, [255, 0, 255]]
    ];

    if (age <= stops[0][0]) return stops[0][1];
    if (age >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

    for (let s = 0; s < stops.length - 1; s += 1) {
      const ageA = stops[s][0];
      const colorA = stops[s][1];
      const ageB = stops[s + 1][0];
      const colorB = stops[s + 1][1];

      if (age >= ageA && age <= ageB) {
        const t = (age - ageA) / (ageB - ageA);
        return [
          Math.round(lerp(colorA[0], colorB[0], t)),
          Math.round(lerp(colorA[1], colorB[1], t)),
          Math.round(lerp(colorA[2], colorB[2], t))
        ];
      }
    }
    return [255, 255, 255];
  }

  function setRule(nextRule, centerMap = false) {
    if (!isValidRule(nextRule)) return;

    rule = {
      bStart: nextRule.bStart,
      bEnd: nextRule.bEnd,
      sStart: nextRule.sStart,
      sEnd: nextRule.sEnd
    };

    if (centerMap) centerMapOnCurrent();

    resetPattern();
    drawMainUniverse();
    updateUi();
  }

  function randomizeConnectedRule() {
    const b = connectedIntervals[randomInt(0, connectedIntervals.length - 1)];
    const s = connectedIntervals[randomInt(0, connectedIntervals.length - 1)];
    setRule({ bStart: b.start, bEnd: b.end, sStart: s.start, sEnd: s.end }, true);
  }

  function parseConnectedInput(raw) {
    const value = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!value) return null;

    const idMatch = value.match(/^([1-8])([1-8])([1-8])([1-8])$/);
    if (idMatch) {
      const candidate = {
        bStart: Number(idMatch[1]),
        bEnd: Number(idMatch[2]),
        sStart: Number(idMatch[3]),
        sEnd: Number(idMatch[4])
      };
      return isValidRule(candidate) ? candidate : null;
    }

    const ruleMatch = value.match(/^B([1-8]+)\/S([1-8]+)$/);
    if (ruleMatch) {
      const bDigits = [...new Set(ruleMatch[1].split("").map(Number))].sort((a, b) => a - b);
      const sDigits = [...new Set(ruleMatch[2].split("").map(Number))].sort((a, b) => a - b);
      if (!isContiguous(bDigits) || !isContiguous(sDigits)) return null;

      const candidate = {
        bStart: bDigits[0],
        bEnd: bDigits[bDigits.length - 1],
        sStart: sDigits[0],
        sEnd: sDigits[sDigits.length - 1]
      };
      return isValidRule(candidate) ? candidate : null;
    }

    return null;
  }

  function isContiguous(values) {
    if (values.length === 0) return false;
    for (let i = 1; i < values.length; i += 1) {
      if (values[i] !== values[i - 1] + 1) return false;
    }
    return true;
  }

  function isValidRule(candidate) {
    return (
      candidate.bStart >= 1 && candidate.bStart <= 8 &&
      candidate.bEnd >= 1 && candidate.bEnd <= 8 &&
      candidate.sStart >= 1 && candidate.sStart <= 8 &&
      candidate.sEnd >= 1 && candidate.sEnd <= 8 &&
      candidate.bStart <= candidate.bEnd &&
      candidate.sStart <= candidate.sEnd
    );
  }

  function updateUi() {
    const compactRule = ruleString(rule);
    ruleNameEl.textContent = compactRule;
    ruleNameEl.title = compactRule;
    birthRangeEl.textContent = rangeDash(rule.bStart, rule.bEnd);
    survivalRangeEl.textContent = rangeDash(rule.sStart, rule.sEnd);
    groupNameEl.textContent = `B${rule.bStart}+/S${rule.sStart}+`;
    connectedIdEl.textContent = `${rule.bStart}${rule.bEnd}${rule.sStart}${rule.sEnd}`;
    orbCurrentRule.textContent = compactRule;
    jumpInput.value = compactRule;
    updateLiveStats();
    renderOrb();
    if (mapView.open) {
      updateMapCameraAnimation(timestamp);

      if (timestamp - lastMapTick >= MAP_SIM_TICK_MS) {
        lastMapTick = timestamp;
        stepVisibleMapUniverses();
      }
      renderSpaceMap();
    }
  }

  function updateLiveStats() {
    generationEl.textContent = String(generation);
    liveCountEl.textContent = String(countLiveCells(cells));
  }

  function countLiveCells(cellBuffer) {
    let count = 0;
    for (let i = 0; i < CELL_COUNT; i += 1) count += cellBuffer[i];
    return count;
  }

  function svgPointFromEvent(event) {
    const point = orbSvg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(orbSvg.getScreenCTM().inverse());
  }

  function hitTestOrb(point) {
    let best = null;
    let bestDistance = Infinity;

    for (const node of renderedOrbNodes) {
      if (!node.valid) continue;
      const distance = Math.hypot(point.x - node.x, point.y - node.y);
      const threshold = node.radius + 10;
      if (distance <= threshold && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }

    return best;
  }

  function updateOrbHover(point) {
    const hit = hitTestOrb(point);
    clearOrbHot();

    if (hit) {
      hit.element.classList.add("hot");
      orbHoverLabel.textContent = `${hit.move.label} → ${ruleString(hit.candidate)}`;
    } else {
      orbHoverLabel.textContent = "Click a nearby rule to jump there.";
    }
  }

  function clearOrbHot() {
    renderedOrbNodes.forEach((node) => node.element?.classList.remove("hot"));
  }

  function renderOrb() {
    orbNodeLayer.replaceChildren();
    orbLinkLayer.replaceChildren();
    renderedOrbNodes = [];

    const nodes = connectedMoves.map((move) => {
      const candidate = { bStart: rule.bStart, bEnd: rule.bEnd, sStart: rule.sStart, sEnd: rule.sEnd };
      candidate[move.axis] += move.delta;

      const valid = isValidRule(candidate);
      const rotated = rotatePoint(move.pos, orbYaw, orbPitch);
      const depthScale = clamp(0.46 + (rotated.z + 1) * 0.34, 0.46, 1.14);
      const radius = valid ? 30 * depthScale : 20 * depthScale;

      return { move, candidate, valid, x: rotated.x * 92, y: rotated.y * 92, z: rotated.z, radius };
    }).sort((a, b) => a.z - b.z);

    for (const node of nodes) {
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.classList.add("orb-link", node.move.kind);
      if (!node.valid) line.classList.add("invalid");
      line.setAttribute("x1", "0");
      line.setAttribute("y1", "0");
      line.setAttribute("x2", node.x.toFixed(2));
      line.setAttribute("y2", node.y.toFixed(2));
      orbLinkLayer.append(line);
    }

    for (const node of nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.classList.add("orb-node", node.move.kind);
      if (!node.valid) g.classList.add("invalid");
      g.setAttribute("transform", `translate(${node.x.toFixed(2)} ${node.y.toFixed(2)})`);

      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", node.radius.toFixed(2));

      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      text.textContent = node.move.label;

      const dest = document.createElementNS("http://www.w3.org/2000/svg", "text");
      dest.classList.add("orb-destination-label");
      dest.setAttribute("text-anchor", "middle");
      dest.setAttribute("y", String(node.radius + 13));
      dest.textContent = node.valid ? ruleString(node.candidate) : "";

      g.append(circle, text, dest);
      orbNodeLayer.append(g);

      renderedOrbNodes.push({ ...node, element: g });
    }
  }

  function renderSpaceMap() {
    spaceMapCtx.imageSmoothingEnabled = false;
    const width = window.innerWidth;
    const height = window.innerHeight;

    spaceMapCtx.fillStyle = "#02040b";
    spaceMapCtx.fillRect(0, 0, width, height);

    drawMapStars(width, height);

    const hitRects = [];
    const currentId = connectedId(rule);

    for (let bs = 1; bs <= 8; bs += 1) {
      for (let ss = 1; ss <= 8; ss += 1) {
        const cluster = clusterWorldPosition(bs, ss);
        drawSubsetCluster(cluster, bs, ss, hitRects, currentId);
      }
    }

    spaceMapCanvas._hitRects = hitRects;
  }

  function drawMapStars(width, height) {
    spaceMapCtx.save();
    spaceMapCtx.globalAlpha = 0.75;
    for (let i = 0; i < 180; i += 1) {
      const x = (i * 137.508 + mapView.x * 0.05) % width;
      const y = (i * 71.271 + mapView.y * 0.04) % height;
      const r = (i % 7 === 0 ? 1.5 : 0.8) * Math.sqrt(mapView.zoom);
      spaceMapCtx.fillStyle = i % 5 === 0 ? "rgba(160,205,255,0.9)" : "rgba(255,255,255,0.75)";
      spaceMapCtx.beginPath();
      spaceMapCtx.arc(x, y, r, 0, Math.PI * 2);
      spaceMapCtx.fill();
    }
    spaceMapCtx.restore();
  }

  function drawSubsetCluster(cluster, bs, ss, hitRects, currentId) {
    const label = `B${bs}+ / S${ss}+`;
    const origin = worldToScreen(cluster.x, cluster.y);
    const scale = mapView.zoom;
    const universeSize = 54 * scale;
    const gap = autoUniverseGap(scale);
    const labelGap = 18 * scale;

    const visibleBounds = {
      left: origin.x - 80 * scale,
      top: origin.y - 80 * scale,
      right: origin.x + (9 - bs) * (universeSize + gap) + 120 * scale,
      bottom: origin.y + (9 - ss) * (universeSize + gap) + 150 * scale
    };

    if (
      visibleBounds.right < 0 ||
      visibleBounds.bottom < 0 ||
      visibleBounds.left > window.innerWidth ||
      visibleBounds.top > window.innerHeight
    ) {
      return;
    }

    spaceMapCtx.save();
    spaceMapCtx.fillStyle = "rgba(5, 10, 22, 0.18)";
    roundedRectPath(
      spaceMapCtx,
      origin.x - 34 * scale,
      origin.y - 54 * scale,
      (9 - bs) * (universeSize + gap) + 52 * scale,
      (9 - ss) * (universeSize + gap) + 92 * scale,
      28 * scale
    );
    spaceMapCtx.fill();

    spaceMapCtx.strokeStyle = "rgba(142, 205, 255, 0.22)";
    spaceMapCtx.lineWidth = Math.max(1, 1.4 * scale);
    spaceMapCtx.setLineDash([10 * scale, 16 * scale]);
    roundedRectPath(
      spaceMapCtx,
      origin.x - 34 * scale,
      origin.y - 54 * scale,
      (9 - bs) * (universeSize + gap) + 52 * scale,
      (9 - ss) * (universeSize + gap) + 92 * scale,
      28 * scale
    );
    spaceMapCtx.stroke();
    spaceMapCtx.setLineDash([]);

    spaceMapCtx.font = `${Math.max(11, 17 * scale)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    spaceMapCtx.textAlign = "left";
    spaceMapCtx.textBaseline = "middle";
    spaceMapCtx.fillStyle = "rgba(232, 244, 255, 0.88)";
    spaceMapCtx.fillText(label, origin.x - 20 * scale, origin.y - 30 * scale);

    for (let be = bs; be <= 8; be += 1) {
      for (let se = ss; se <= 8; se += 1) {
        const localX = (be - bs) * (universeSize + gap);
        const localY = (se - ss) * (universeSize + gap);
        const x = origin.x + localX;
        const y = origin.y + localY;
        const currentRule = { bStart: bs, bEnd: be, sStart: ss, sEnd: se };
        const id = connectedId(currentRule);
        const labelRule = ruleString(currentRule);

        if (x + universeSize < -80 || y + universeSize < -80 || x > window.innerWidth + 80 || y > window.innerHeight + 80) {
          continue;
        }

        drawUniverseThumbnailFromRule(currentRule, x, y, universeSize);

        if (id === currentId) {
          roundedRectPath(spaceMapCtx, x - 7 * scale, y - 7 * scale, universeSize + 14 * scale, universeSize + 14 * scale, Math.max(8, 14 * scale));
          spaceMapCtx.strokeStyle = "#ffffff";
          spaceMapCtx.lineWidth = Math.max(2, 3 * scale);
          spaceMapCtx.stroke();
        }

        if (scale > 0.68) {
          const labelSize = Math.max(5.5, 7.4 * scale);
          spaceMapCtx.font = `${labelSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
          spaceMapCtx.textAlign = "center";
          spaceMapCtx.textBaseline = "top";
          spaceMapCtx.fillStyle = "rgba(230,242,255,0.82)";
          spaceMapCtx.fillText(labelRule, x + universeSize / 2, y + universeSize + labelGap * 0.32);
        }

        hitRects.push({
          x,
          y,
          size: universeSize,
          rule: currentRule
        });
      }
    }

    spaceMapCtx.restore();
  }

  function drawUniverseThumbnailFromRule(ruleObject, x, y, size) {
    const state = getMapUniverseState(ruleObject);
    updateMapStateCanvas(state);

    const borderRadius = Math.max(5, 10 * mapView.zoom);
    const pad = Math.max(2, 4 * mapView.zoom);

    spaceMapCtx.save();

    roundedRectPath(spaceMapCtx, x - pad, y - pad, size + pad * 2, size + pad * 2, borderRadius);
    spaceMapCtx.fillStyle = "rgba(7, 14, 30, 0.82)";
    spaceMapCtx.fill();
    spaceMapCtx.strokeStyle = "rgba(169, 214, 255, 0.42)";
    spaceMapCtx.lineWidth = Math.max(1, 1.35 * mapView.zoom);
    spaceMapCtx.stroke();

    spaceMapCtx.imageSmoothingEnabled = false;
    spaceMapCtx.fillStyle = "#000";
    spaceMapCtx.fillRect(x, y, size, size);
    spaceMapCtx.drawImage(state.canvas, Math.round(x), Math.round(y), Math.round(size), Math.round(size));

    spaceMapCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    spaceMapCtx.lineWidth = Math.max(1, 1 * mapView.zoom);
    spaceMapCtx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(size) - 1, Math.round(size) - 1);

    spaceMapCtx.restore();
  }

  function getMapUniverseState(ruleObject) {
    const key = connectedId(ruleObject);
    let state = mapUniverseStates.get(key);

    if (state) return state;

    const offscreen = document.createElement("canvas");
    offscreen.width = GRID_SIZE;
    offscreen.height = GRID_SIZE;

    state = {
      rule: { ...ruleObject },
      cells: new Uint8Array(CELL_COUNT),
      nextCells: new Uint8Array(CELL_COUNT),
      ages: new Uint16Array(CELL_COUNT),
      nextAges: new Uint16Array(CELL_COUNT),
      canvas: offscreen,
      ctx: offscreen.getContext("2d", { alpha: false }),
      image: null,
      stableTicks: 0,
      dirty: true,
      running: false
    };

    state.ctx.imageSmoothingEnabled = false;
    state.image = state.ctx.createImageData(GRID_SIZE, GRID_SIZE);
    seedMapUniverse(state);
    mapUniverseStates.set(key, state);
    return state;
  }

  function seedMapUniverse(state) {
    state.cells.fill(0);
    state.nextCells.fill(0);
    state.ages.fill(0);
    state.nextAges.fill(0);

    const start = Math.floor((GRID_SIZE - INITIAL_PATTERN_SIZE) / 2);
    let seed = (Math.floor(Math.random() * 0xffffffff) ^ hashRule(state.rule) ^ mapSeedSalt) >>> 0;

    for (let y = start; y < start + INITIAL_PATTERN_SIZE; y += 1) {
      for (let x = start; x < start + INITIAL_PATTERN_SIZE; x += 1) {
        seed = seededNext(seed);
        if ((seed / 4294967296) < INITIAL_LIVE_CHANCE) {
          state.cells[idx(x, y)] = 1;
        }
      }
    }

    state.stableTicks = 0;
    state.dirty = true;
  }

  function updateMapStateCanvas(state) {
    if (!state.dirty) return;

    const data = state.image.data;
    for (let i = 0; i < CELL_COUNT; i += 1) {
      const o = i * 4;
      if (state.cells[i]) {
        const color = colorForAge(state.ages[i]);
        data[o] = color[0];
        data[o + 1] = color[1];
        data[o + 2] = color[2];
        data[o + 3] = 255;
      } else {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 255;
      }
    }

    state.ctx.putImageData(state.image, 0, 0);
    state.dirty = false;
  }

  function stepVisibleMapUniverses() {
    const visibleRules = getVisibleMapRules();
    if (visibleRules.length > MAP_VISIBLE_RUN_LIMIT) return;

    for (const visibleRule of visibleRules) {
      const state = getMapUniverseState(visibleRule);
      const changed = stepCells(state.rule, state.cells, state.nextCells, state.ages, state.nextAges);
      state.dirty = true;

      if (changed) state.stableTicks = 0;
      else state.stableTicks += 1;

      if (state.stableTicks >= STABLE_RESET_DELAY) {
        seedMapUniverse(state);
      }
    }
  }

  function getVisibleMapRules() {
    const rules = [];
    const currentVisible = [];

    for (let bs = 1; bs <= 8; bs += 1) {
      for (let ss = 1; ss <= 8; ss += 1) {
        const cluster = clusterWorldPosition(bs, ss);
        const origin = worldToScreen(cluster.x, cluster.y);
        const scale = mapView.zoom;
        const universeSize = 54 * scale;
        const gap = autoUniverseGap(scale);

        for (let be = bs; be <= 8; be += 1) {
          for (let se = ss; se <= 8; se += 1) {
            const x = origin.x + (be - bs) * (universeSize + gap);
            const y = origin.y + (se - ss) * (universeSize + gap);

            if (x + universeSize < -80 || y + universeSize < -80 || x > window.innerWidth + 80 || y > window.innerHeight + 80) {
              continue;
            }

            currentVisible.push({ bStart: bs, bEnd: be, sStart: ss, sEnd: se });
          }
        }
      }
    }

    return currentVisible;
  }

  function hitTestSpaceMap(clientX, clientY) {
    const rect = spaceMapCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const hitRects = spaceMapCanvas._hitRects || [];

    for (let i = hitRects.length - 1; i >= 0; i -= 1) {
      const hit = hitRects[i];
      if (x >= hit.x && x <= hit.x + hit.size && y >= hit.y && y <= hit.y + hit.size) {
        return hit;
      }
    }

    return null;
  }

  function worldToScreen(x, y) {
    return {
      x: x * mapView.zoom + mapView.x,
      y: y * mapView.zoom + mapView.y
    };
  }

  function screenToWorld(x, y) {
    return {
      x: (x - mapView.x) / mapView.zoom,
      y: (y - mapView.y) / mapView.zoom
    };
  }

  function autoUniverseGap(scale = 1) {
    return 24 * scale;
  }

  function subsetSpan(start) {
    const columns = 9 - start;
    const baseUniverseSize = 54;
    const baseGap = 24;
    return columns * baseUniverseSize + Math.max(0, columns - 1) * baseGap;
  }

  function clusterWorldPosition(bs, ss) {
    let x = 0;
    let y = 0;
    const subsetGap = 190;

    for (let n = 1; n < bs; n += 1) {
      x += subsetSpan(n) + subsetGap;
    }

    for (let n = 1; n < ss; n += 1) {
      y += subsetSpan(n) + subsetGap;
    }

    return { x, y };
  }

  function centerMapOnCurrent() {
    const cluster = clusterWorldPosition(rule.bStart, rule.sStart);
    const localX = (rule.bEnd - rule.bStart) * (54 + 24);
    const localY = (rule.sEnd - rule.sStart) * (54 + 24);
    const worldX = cluster.x + localX + 27;
    const worldY = cluster.y + localY + 27;

    mapView.zoom = clamp(mapView.zoom || 1, 0.28, 3.8);
    mapView.x = window.innerWidth / 2 - worldX * mapView.zoom;
    mapView.y = window.innerHeight / 2 - worldY * mapView.zoom;
  }

  function buildConnectedIntervals() {
    const intervals = [];
    for (let start = 1; start <= 8; start += 1) {
      for (let end = start; end <= 8; end += 1) intervals.push({ start, end });
    }
    return intervals;
  }

  function intervalIndex(start, end) {
    for (let i = 0; i < connectedIntervals.length; i += 1) {
      const interval = connectedIntervals[i];
      if (interval.start === start && interval.end === end) return i;
    }
    return 0;
  }

  function rotatePoint(point, yaw, pitch) {
    let [x, y, z] = point;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y2 = y * cp - z1 * sp;
    const z2 = y * sp + z1 * cp;
    return { x: x1, y: y2, z: z2 };
  }

  function ruleString(value) {
    return `B${rangeDigits(value.bStart, value.bEnd)}/S${rangeDigits(value.sStart, value.sEnd)}`;
  }

  function connectedId(value) {
    return `${value.bStart}${value.bEnd}${value.sStart}${value.sEnd}`;
  }

  function rangeDigits(start, end) {
    let value = "";
    for (let n = start; n <= end; n += 1) value += String(n);
    return value;
  }

  function rangeDash(start, end) {
    return start === end ? String(start) : `${start}-${end}`;
  }

  function animateGrow() {
    frameEl.classList.remove("grow");
    void frameEl.offsetWidth;
    frameEl.classList.add("grow");
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function hashRule(value) {
    let n = 2166136261;
    n ^= value.bStart; n = Math.imul(n, 16777619);
    n ^= value.bEnd; n = Math.imul(n, 16777619);
    n ^= value.sStart; n = Math.imul(n, 16777619);
    n ^= value.sEnd; n = Math.imul(n, 16777619);
    return n >>> 0;
  }

  function seededNext(seed) {
    return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function debounce(fn, delay) {
    let handle = null;
    return (...args) => {
      window.clearTimeout(handle);
      handle = window.setTimeout(() => fn(...args), delay);
    };
  }
})();
