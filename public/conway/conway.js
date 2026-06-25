const GRID_SIZE = 50;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const INITIAL_PATTERN_SIZE = 10;
const INITIAL_LIVE_CHANCE = 0.34;
const TICK_MS = 100;
const STABLE_RESET_DELAY = 2;

const SITE_LIKE = {
  intro: {
    enabled: true,
    blackFadeDelayMs: 90,
    blackFadeDurationMs: 1450
  },
  stars: {
    enabled: true,
    count: 260,
    minSizePx: 1,
    maxSizePx: 2,
    minOpacity: 0.22,
    maxOpacity: 0.92,
    regenerateOnResize: true
  },
  interaction: {
    mouseParallaxX: 16,
    mouseParallaxY: 12,
    starParallaxMultiplier: 0.55
  }
};

const scene = document.getElementById("scene");
const stars = document.getElementById("stars");
const canvas = document.getElementById("universe-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const frameEl = document.getElementById("universe-frame");

const ruleNameEl = document.getElementById("rule-name");
const birthRangeEl = document.getElementById("birth-range");
const survivalRangeEl = document.getElementById("survival-range");
const groupNameEl = document.getElementById("group-name");
const generationEl = document.getElementById("generation");
const liveCountEl = document.getElementById("live-count");
const statusPill = document.getElementById("status-pill");
const randomButton = document.getElementById("random-button");
const resetButton = document.getElementById("reset-button");
const pauseButton = document.getElementById("pause-button");

let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let starResizeTimer = null;
let pageHidden = document.hidden;

const pointer = {
  normalizedX: 0,
  normalizedY: 0,
  parallaxX: 0,
  parallaxY: 0,
  targetParallaxX: 0,
  targetParallaxY: 0
};

canvas.width = GRID_SIZE;
canvas.height = GRID_SIZE;
ctx.imageSmoothingEnabled = false;

const image = ctx.createImageData(GRID_SIZE, GRID_SIZE);
const cells = new Uint8Array(CELL_COUNT);
const nextCells = new Uint8Array(CELL_COUNT);
const ages = new Uint16Array(CELL_COUNT);
const nextAges = new Uint16Array(CELL_COUNT);
const neighbors = Array.from({ length: CELL_COUNT }, () => new Uint16Array(8));

let rule = {
  bStart: 3,
  bEnd: 3,
  sStart: 2,
  sEnd: 3
};

let generation = 0;
let stableTicks = 0;
let lastTick = 0;
let paused = false;

init();

function init() {
  generateRandomStarfield();
  prepareIntroShell();
  precomputeNeighbors();
  setupButtons();
  setupPointer();
  resetPattern();
  updateUi();
  draw();
  startIntroAnimation();
  requestAnimationFrame(animate);

  window.addEventListener("resize", () => {
    if (SITE_LIKE.stars.enabled && SITE_LIKE.stars.regenerateOnResize) {
      window.clearTimeout(starResizeTimer);
      starResizeTimer = window.setTimeout(generateRandomStarfield, 180);
    }
  });

  document.addEventListener("visibilitychange", () => {
    pageHidden = document.hidden;
    lastTick = 0;
  });

  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
    reducedMotion = event.matches;
    if (reducedMotion) {
      document.body.classList.remove("intro-pending", "intro-fade-running");
    }
  });
}

function setupButtons() {
  document.querySelectorAll(".dimension-pad button").forEach((button) => {
    button.addEventListener("click", () => {
      const axis = button.dataset.axis;
      const dir = Number(button.dataset.dir);
      moveAxis(axis, dir);
    });
  });

  randomButton.addEventListener("click", randomizeRule);

  resetButton.addEventListener("click", () => {
    resetPattern();
    draw();
    updateUi();
  });

  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Resume" : "Pause";
    statusPill.textContent = paused ? "paused" : "running";
    statusPill.classList.toggle("paused", paused);
  });
}

function prepareIntroShell() {
  if (!SITE_LIKE.intro.enabled || reducedMotion) {
    return;
  }

  document.body.classList.add("intro-pending");
  document.documentElement.style.setProperty("--intro-black-fade-delay", `${SITE_LIKE.intro.blackFadeDelayMs}ms`);
  document.documentElement.style.setProperty("--intro-black-fade-duration", `${SITE_LIKE.intro.blackFadeDurationMs}ms`);
}

function startIntroAnimation() {
  if (!SITE_LIKE.intro.enabled || reducedMotion) {
    document.body.classList.remove("intro-pending", "intro-fade-running");
    return;
  }

  document.body.classList.add("intro-fade-running");

  const total = SITE_LIKE.intro.blackFadeDelayMs + SITE_LIKE.intro.blackFadeDurationMs + 180;
  window.setTimeout(() => {
    document.body.classList.remove("intro-pending", "intro-fade-running");
  }, total);
}

function generateRandomStarfield() {
  if (!stars || !SITE_LIKE.stars.enabled) {
    if (stars) stars.style.backgroundImage = "none";
    return;
  }

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const count = Math.max(0, Number(SITE_LIKE.stars.count));
  const minSize = Math.max(1, Number(SITE_LIKE.stars.minSizePx));
  const maxSize = Math.max(minSize, Number(SITE_LIKE.stars.maxSizePx));
  const minOpacity = clamp(Number(SITE_LIKE.stars.minOpacity), 0, 1);
  const maxOpacity = clamp(Number(SITE_LIKE.stars.maxOpacity), minOpacity, 1);

  const rects = [];

  for (let i = 0; i < count; i += 1) {
    const size = randomRange(minSize, maxSize);
    const x = randomRange(0, Math.max(0, width - size));
    const y = randomRange(0, Math.max(0, height - size));
    const opacity = randomRange(minOpacity, maxOpacity);

    rects.push(
      `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" rx="${(size / 2).toFixed(2)}" fill="white" opacity="${opacity.toFixed(3)}"/>`
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    rects.join("") +
    `</svg>`;

  stars.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  stars.style.backgroundSize = `${width}px ${height}px`;
  stars.style.backgroundRepeat = "no-repeat";
  stars.style.backgroundPosition = "center center";
}

function setupPointer() {
  window.addEventListener("pointermove", (event) => {
    const rect = scene.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    pointer.normalizedX = clamp((localX / rect.width) * 2 - 1, -1, 1);
    pointer.normalizedY = clamp((localY / rect.height) * 2 - 1, -1, 1);

    pointer.targetParallaxX = pointer.normalizedX * SITE_LIKE.interaction.mouseParallaxX;
    pointer.targetParallaxY = pointer.normalizedY * SITE_LIKE.interaction.mouseParallaxY;

    document.documentElement.style.setProperty("--mouse-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--mouse-y", `${event.clientY}px`);
  }, { passive: true });

  window.addEventListener("pointerleave", () => {
    pointer.normalizedX = 0;
    pointer.normalizedY = 0;
    pointer.targetParallaxX = 0;
    pointer.targetParallaxY = 0;
  }, { passive: true });
}

function animate(timestamp) {
  requestAnimationFrame(animate);

  updatePointerParallax();

  if (pageHidden) return;

  if (!paused && timestamp - lastTick >= TICK_MS) {
    lastTick = timestamp;
    step();
    draw();
    updateUi();
  }
}

function updatePointerParallax() {
  const lerpAmount = reducedMotion ? 1 : 0.08;

  pointer.parallaxX = lerp(pointer.parallaxX, pointer.targetParallaxX, lerpAmount);
  pointer.parallaxY = lerp(pointer.parallaxY, pointer.targetParallaxY, lerpAmount);

  document.documentElement.style.setProperty("--parallax-x", `${pointer.parallaxX}px`);
  document.documentElement.style.setProperty("--parallax-y", `${pointer.parallaxY}px`);
  document.documentElement.style.setProperty("--stars-x", `${pointer.parallaxX * SITE_LIKE.interaction.starParallaxMultiplier}px`);
  document.documentElement.style.setProperty("--stars-y", `${pointer.parallaxY * SITE_LIKE.interaction.starParallaxMultiplier}px`);
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

function step() {
  let changed = false;

  for (let i = 0; i < CELL_COUNT; i += 1) {
    const neighborCount = countNeighbors(i);
    const alive = cells[i] === 1;
    let nextAlive = 0;

    if (alive) {
      nextAlive = neighborCount >= rule.sStart && neighborCount <= rule.sEnd ? 1 : 0;
    } else {
      nextAlive = neighborCount >= rule.bStart && neighborCount <= rule.bEnd ? 1 : 0;
    }

    nextCells[i] = nextAlive;

    if (nextAlive) {
      nextAges[i] = alive ? Math.min(65535, ages[i] + 1) : 0;
    } else {
      nextAges[i] = 0;
    }

    if (nextAlive !== cells[i]) changed = true;
  }

  cells.set(nextCells);
  ages.set(nextAges);
  generation += 1;

  if (changed) {
    stableTicks = 0;
  } else {
    stableTicks += 1;
  }

  if (stableTicks >= STABLE_RESET_DELAY) {
    resetPattern();
  }
}

function countNeighbors(i) {
  const list = neighbors[i];

  return (
    cells[list[0]] +
    cells[list[1]] +
    cells[list[2]] +
    cells[list[3]] +
    cells[list[4]] +
    cells[list[5]] +
    cells[list[6]] +
    cells[list[7]]
  );
}

function draw() {
  const data = image.data;

  for (let i = 0; i < CELL_COUNT; i += 1) {
    const o = i * 4;

    if (cells[i]) {
      const [r, g, b] = colorForAge(ages[i]);
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
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

  for (let i = 0; i < stops.length - 1; i += 1) {
    const [a0, c0] = stops[i];
    const [a1, c1] = stops[i + 1];

    if (age >= a0 && age <= a1) {
      const t = (age - a0) / (a1 - a0);
      return [
        Math.round(lerp(c0[0], c1[0], t)),
        Math.round(lerp(c0[1], c1[1], t)),
        Math.round(lerp(c0[2], c1[2], t))
      ];
    }
  }

  return [255, 255, 255];
}

function moveAxis(axis, dir) {
  const next = { ...rule };
  next[axis] += dir;

  if (!isValidRule(next)) return;

  rule = next;
  resetPattern();
  draw();
  updateUi();
}

function randomizeRule() {
  const bStart = randomInt(1, 8);
  const bEnd = randomInt(bStart, 8);
  const sStart = randomInt(1, 8);
  const sEnd = randomInt(sStart, 8);

  rule = { bStart, bEnd, sStart, sEnd };
  resetPattern();
  draw();
  updateUi();
}

function isValidRule(candidate) {
  return (
    candidate.bStart >= 1 &&
    candidate.bStart <= 8 &&
    candidate.bEnd >= 1 &&
    candidate.bEnd <= 8 &&
    candidate.sStart >= 1 &&
    candidate.sStart <= 8 &&
    candidate.sEnd >= 1 &&
    candidate.sEnd <= 8 &&
    candidate.bStart <= candidate.bEnd &&
    candidate.sStart <= candidate.sEnd
  );
}

function ruleString() {
  return `B${rangeStringCompact(rule.bStart, rule.bEnd)}/S${rangeStringCompact(rule.sStart, rule.sEnd)}`;
}

function groupString() {
  return `B${rule.bStart}+/S${rule.sStart}+`;
}

function rangeStringCompact(start, end) {
  return start === end ? `${start}` : `${start}-${end}`;
}

function updateUi() {
  ruleNameEl.textContent = ruleString();
  birthRangeEl.textContent = rangeStringCompact(rule.bStart, rule.bEnd);
  survivalRangeEl.textContent = rangeStringCompact(rule.sStart, rule.sEnd);
  groupNameEl.textContent = groupString();
  generationEl.textContent = String(generation);
  liveCountEl.textContent = String(countLiveCells());

  document.querySelectorAll(".dimension-pad button").forEach((button) => {
    const axis = button.dataset.axis;
    const dir = Number(button.dataset.dir);
    const candidate = { ...rule };
    candidate[axis] += dir;
    button.disabled = !isValidRule(candidate);
  });
}

function countLiveCells() {
  let count = 0;
  for (let i = 0; i < CELL_COUNT; i += 1) count += cells[i];
  return count;
}

function animateGrow() {
  if (reducedMotion) return;
  frameEl.classList.remove("grow");
  void frameEl.offsetWidth;
  frameEl.classList.add("grow");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
