const GRID_SIZE = 50;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const INITIAL_PATTERN_SIZE = 10;
const INITIAL_LIVE_CHANCE = 0.34;
const TICK_MS = 100;
const STABLE_RESET_DELAY = 2;

const canvas = document.querySelector("#universe-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const frameEl = document.querySelector("#universe-frame");

const ruleNameEl = document.querySelector("#rule-name");
const birthRangeEl = document.querySelector("#birth-range");
const survivalRangeEl = document.querySelector("#survival-range");
const groupNameEl = document.querySelector("#group-name");
const generationEl = document.querySelector("#generation");
const liveCountEl = document.querySelector("#live-count");
const statusPill = document.querySelector("#status-pill");
const randomButton = document.querySelector("#random-button");
const resetButton = document.querySelector("#reset-button");
const pauseButton = document.querySelector("#pause-button");

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
let pointerX = 0;
let pointerY = 0;

precomputeNeighbors();
resetPattern();
updateUi();
draw();
setupParallax();

function markLoaded() {
  document.body.classList.add("is-loaded");
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  markLoaded();
} else {
  window.addEventListener("load", markLoaded, { once: true });
}

setTimeout(markLoaded, 350);

requestAnimationFrame(loop);

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
  togglePause();
});

window.addEventListener("keydown", (event) => {
  if (event.target && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) {
    return;
  }

  const keyMap = {
    q: ["bStart", -1],
    w: ["bStart", 1],
    a: ["bEnd", -1],
    s: ["bEnd", 1],
    e: ["sStart", -1],
    r: ["sStart", 1],
    d: ["sEnd", -1],
    f: ["sEnd", 1]
  };

  const mapped = keyMap[event.key.toLowerCase()];

  if (mapped) {
    event.preventDefault();
    moveAxis(mapped[0], mapped[1]);
  }

  if (event.key === " ") {
    event.preventDefault();
    togglePause();
  }

  if (event.key.toLowerCase() === "x") {
    randomizeRule();
  }

  if (event.key.toLowerCase() === "z") {
    resetPattern();
    draw();
    updateUi();
  }
});

function loop(timestamp) {
  requestAnimationFrame(loop);

  updateParallax();

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
          if (dx === 0 && dy === 0) {
            continue;
          }

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
  let count = 0;

  count += cells[list[0]];
  count += cells[list[1]];
  count += cells[list[2]];
  count += cells[list[3]];
  count += cells[list[4]];
  count += cells[list[5]];
  count += cells[list[6]];
  count += cells[list[7]];

  return count;
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

const ageStops = [
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

function colorForAge(age) {
  if (age <= 0) {
    return ageStops[0][1];
  }

  for (let i = 0; i < ageStops.length - 1; i += 1) {
    const [ageA, colorA] = ageStops[i];
    const [ageB, colorB] = ageStops[i + 1];

    if (age >= ageA && age <= ageB) {
      const t = smoothstep((age - ageA) / (ageB - ageA));
      return mixColor(colorA, colorB, t);
    }
  }

  return ageStops[ageStops.length - 1][1];
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function moveAxis(axis, dir) {
  const next = { ...rule };

  next[axis] += dir;

  next.bStart = clamp(next.bStart, 1, 8);
  next.bEnd = clamp(next.bEnd, 1, 8);
  next.sStart = clamp(next.sStart, 1, 8);
  next.sEnd = clamp(next.sEnd, 1, 8);

  if (axis === "bStart" && next.bStart > next.bEnd) {
    return;
  }

  if (axis === "bEnd" && next.bEnd < next.bStart) {
    return;
  }

  if (axis === "sStart" && next.sStart > next.sEnd) {
    return;
  }

  if (axis === "sEnd" && next.sEnd < next.sStart) {
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

function togglePause() {
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  statusPill.textContent = paused ? "paused" : "running";
  statusPill.classList.toggle("paused", paused);
}

function ruleString() {
  return `B${compactRangeString(rule.bStart, rule.bEnd)}/S${compactRangeString(rule.sStart, rule.sEnd)}`;
}

function groupString() {
  return `B${rule.bStart}+/S${rule.sStart}+`;
}

function compactRangeString(start, end) {
  let s = "";

  for (let n = start; n <= end; n += 1) {
    s += String(n);
  }

  return s;
}

function displayRangeString(start, end) {
  if (start === end) {
    return String(start);
  }

  return `${start}-${end}`;
}

function updateUi() {
  ruleNameEl.textContent = ruleString();
  birthRangeEl.textContent = displayRangeString(rule.bStart, rule.bEnd);
  survivalRangeEl.textContent = displayRangeString(rule.sStart, rule.sEnd);
  groupNameEl.textContent = groupString();
  generationEl.textContent = String(generation);
  liveCountEl.textContent = String(countLiveCells());

  document.querySelectorAll(".dimension-pad button").forEach((button) => {
    const axis = button.dataset.axis;
    const dir = Number(button.dataset.dir);
    button.disabled = !canMove(axis, dir);
  });
}

function canMove(axis, dir) {
  const next = { ...rule };
  next[axis] += dir;

  if (next[axis] < 1 || next[axis] > 8) {
    return false;
  }

  if (axis === "bStart" && next.bStart > next.bEnd) {
    return false;
  }

  if (axis === "bEnd" && next.bEnd < next.bStart) {
    return false;
  }

  if (axis === "sStart" && next.sStart > next.sEnd) {
    return false;
  }

  if (axis === "sEnd" && next.sEnd < next.sStart) {
    return false;
  }

  return true;
}

function countLiveCells() {
  let count = 0;

  for (let i = 0; i < CELL_COUNT; i += 1) {
    count += cells[i];
  }

  return count;
}

function animateGrow() {
  frameEl.classList.remove("grow");
  void frameEl.offsetWidth;
  frameEl.classList.add("grow");
}

function setupParallax() {
  document.querySelectorAll(".parallax-layer").forEach((el) => {
    const depth = Number(el.dataset.depth ?? 0.2);
    el.style.setProperty("--depth-x", `${depth * 0.018}px`);
    el.style.setProperty("--depth-y", `${depth * 0.018}px`);
  });

  window.addEventListener("pointermove", (event) => {
    const nx = (event.clientX / window.innerWidth - 0.5) * 2;
    const ny = (event.clientY / window.innerHeight - 0.5) * 2;

    pointerX = nx * 42;
    pointerY = ny * 42;
  }, { passive: true });
}

function updateParallax() {
  const currentX = Number.parseFloat(document.documentElement.style.getPropertyValue("--mouse-x")) || 0;
  const currentY = Number.parseFloat(document.documentElement.style.getPropertyValue("--mouse-y")) || 0;

  const nextX = currentX + (pointerX - currentX) * 0.08;
  const nextY = currentY + (pointerY - currentY) * 0.08;

  document.documentElement.style.setProperty("--mouse-x", `${nextX}px`);
  document.documentElement.style.setProperty("--mouse-y", `${nextY}px`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
