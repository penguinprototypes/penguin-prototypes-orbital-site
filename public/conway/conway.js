const GRID_SIZE = 50;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const INITIAL_PATTERN_SIZE = 10;
const INITIAL_LIVE_CHANCE = 0.34;
const TICK_MS = 100;
const STABLE_RESET_DELAY = 2;

const canvas = document.getElementById("universe-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const frameEl = document.getElementById("universe-frame");
const starCanvas = document.getElementById("star-canvas");
const starCtx = starCanvas.getContext("2d");

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
let mouseX = 0;
let mouseY = 0;
let stars = [];

precomputeNeighbors();
setupButtons();
setupMouseMotion();
setupStars();
resetPattern();
updateUi();
draw();

requestAnimationFrame(loop);

function setupButtons() {
  document.querySelectorAll(".dimension-pad button").forEach((button) => {
    button.addEventListener("click", () => {
      const axis = button.dataset.axis;
      const dir = Number(button.dataset.dir);
      moveAxis(axis, dir);
    });
  });

  randomButton.addEventListener("click", () => {
    randomizeRule();
  });

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

function setupMouseMotion() {
  const layers = Array.from(document.querySelectorAll(".parallax-layer"));
  const glows = Array.from(document.querySelectorAll(".ambient-glow"));

  window.addEventListener("pointermove", (event) => {
    mouseX = event.clientX / window.innerWidth - 0.5;
    mouseY = event.clientY / window.innerHeight - 0.5;

    document.documentElement.style.setProperty("--mouse-x", `${event.clientX}px`);
    document.documentElement.style.setProperty("--mouse-y", `${event.clientY}px`);

    for (const layer of layers) {
      const depth = Number(layer.dataset.depth || 1);
      const tx = mouseX * depth * 14;
      const ty = mouseY * depth * 14;
      layer.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    }

    glows.forEach((glow, index) => {
      const strength = index === 0 ? 28 : -24;
      glow.style.transform = `translate3d(${mouseX * strength}px, ${mouseY * strength}px, 0)`;
    });
  });
}

function setupStars() {
  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    starCanvas.width = Math.floor(window.innerWidth * dpr);
    starCanvas.height = Math.floor(window.innerHeight * dpr);
    starCanvas.style.width = `${window.innerWidth}px`;
    starCanvas.style.height = `${window.innerHeight}px`;
    starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.floor((window.innerWidth * window.innerHeight) / 4200);
    stars = Array.from({ length: Math.max(110, Math.min(360, count)) }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.4 + 0.25,
      a: Math.random() * 0.65 + 0.2,
      drift: Math.random() * 0.18 + 0.04
    }));
  }

  window.addEventListener("resize", resize);
  resize();
}

function drawStars(time = 0) {
  starCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  for (const star of stars) {
    const px = star.x + mouseX * star.drift * 42;
    const py = star.y + mouseY * star.drift * 42 + Math.sin(time * 0.00025 + star.x) * 0.6;
    starCtx.globalAlpha = star.a;
    starCtx.fillStyle = "#ffffff";
    starCtx.beginPath();
    starCtx.arc(px, py, star.r, 0, Math.PI * 2);
    starCtx.fill();
  }

  starCtx.globalAlpha = 1;
}

function loop(timestamp) {
  requestAnimationFrame(loop);
  drawStars(timestamp);

  if (paused) {
    return;
  }

  if (timestamp - lastTick < TICK_MS) {
    return;
  }

  lastTick = timestamp;
  step();
  draw();
  updateUi();
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

    if (nextAlive !== cells[i]) {
      changed = true;
    }
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

  if (!isValidRule(next)) {
    return;
  }

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
  frameEl.classList.remove("grow");
  void frameEl.offsetWidth;
  frameEl.classList.add("grow");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
