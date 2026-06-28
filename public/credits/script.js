const VISIBLE_SEGMENTS = 7;
const CENTER_SLOT = Math.floor(VISIBLE_SEGMENTS / 2);
const SEGMENT_SPACING = 52;
const RING_STEP_DEGREES = 36;
const AUTO_ROTATE_AFTER_MS = 4500;
const AUTO_ROTATE_SPEED = 0.08;
const SCROLL_SPEED = 0.0065;
const LERP_SPEED = 0.12;
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let categories = [];
let targetCategoryPosition = 0;
let categoryPosition = 0;
let selectedEntry = null;
let selectedCategoryIndex = 0;
let lastInteractionTime = Date.now();
let animationFrame = null;
let lastFrameTime = performance.now();

const ring = document.getElementById("cylinderRing");
const stage = document.getElementById("cylinderStage");
const categoryName = document.getElementById("categoryName");
const categoryCounter = document.getElementById("categoryCounter");
const prevCategoryButton = document.getElementById("prevCategory");
const nextCategoryButton = document.getElementById("nextCategory");

const detailType = document.getElementById("detailType");
const detailName = document.getElementById("detailName");
const detailShort = document.getElementById("detailShort");
const detailDescription = document.getElementById("detailDescription");
const detailSections = document.getElementById("detailSections");
const detailLinks = document.getElementById("detailLinks");

async function loadCredits() {
  try {
    const categoryManifest = await fetchJson("/credits/data/categories.json");

    categories = await Promise.all(
      categoryManifest.map(async (category, index) => {
        const files = Array.isArray(category.files) ? category.files : [];
        const entries = await Promise.all(
          files.map(async (file) => {
            const path = buildCreditPath(category.folder, file);
            const text = await fetchText(path);
            return normalizeEntry(parseCreditFile(text, file), category, file);
          })
        );

        return {
          ...category,
          index,
          entries: entries.filter(Boolean),
          scroll: 0,
          targetScroll: 0,
          cylinderEl: null,
          segmentEls: []
        };
      })
    );

    categories = categories.filter((category) => category.entries.length > 0);
    categories.forEach((category, index) => {
      category.index = index;
    });

    if (categories.length === 0) {
      throw new Error("No credit entries were found.");
    }

    buildRingDom();

    const initialLocation = parseHashLocation();
    const requestedCategoryIndex = initialLocation.categoryId
      ? categories.findIndex((category) => category.id === initialLocation.categoryId)
      : 0;

    const startCategoryIndex = requestedCategoryIndex >= 0 ? requestedCategoryIndex : 0;
    const startCategory = categories[startCategoryIndex];
    const requestedEntryIndex = initialLocation.entrySlug
      ? startCategory.entries.findIndex((entry) => entry.slug === initialLocation.entrySlug)
      : -1;

    targetCategoryPosition = startCategoryIndex;
    categoryPosition = startCategoryIndex;
    selectedCategoryIndex = startCategoryIndex;

    if (requestedEntryIndex >= 0) {
      startCategory.scroll = requestedEntryIndex;
      startCategory.targetScroll = requestedEntryIndex;
    }

    selectEntry(startCategory.entries[Math.max(requestedEntryIndex, 0)] || startCategory.entries[0], false);
    updateCategoryHeader();
    renderScene(performance.now());
    startAnimationLoop();
  } catch (error) {
    console.error(error);
    ring.innerHTML = `<p class="error-message">Credits failed to load. Check /credits/data/categories.json and the listed .credit files.</p>`;
    categoryName.textContent = "Credits unavailable";
    categoryCounter.textContent = "";
    detailType.textContent = "Error";
    detailName.textContent = "Credits failed to load";
    detailShort.textContent = "Check the browser console and confirm the .credit files listed in categories.json are being served from /credits/data/.";
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path}: ${response.status}`);
  return response.text();
}

function buildCreditPath(folder, file) {
  const encodedFolder = String(folder).split("/").map(encodeURIComponent).join("/");
  const encodedFile = encodeURIComponent(file);
  return `/credits/data/${encodedFolder}/${encodedFile}`;
}

function parseCreditFile(text, fileName = "") {
  const entry = { sections: [], links: [] };

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();
    if (!value) continue;

    if (key === "section") {
      const [title, ...bodyParts] = value.split("|").map((part) => part.trim());
      entry.sections.push({ title: title || "Note", body: bodyParts.join(" | ") });
      continue;
    }

    if (key === "link") {
      const [label, ...urlParts] = value.split("|").map((part) => part.trim());
      entry.links.push({ label: label || "Link", url: urlParts.join(" | ") });
      continue;
    }

    entry[key] = value;
  }

  if (!entry.name && fileName) entry.name = fileName.replace(/\.credit$/i, "");
  return entry;
}

function normalizeEntry(entry, category, fileName = "") {
  if (!entry || !entry.name) return null;

  return {
    ...entry,
    fileName,
    slug: entry.slug || slugify(entry.name),
    type: entry.type || category.name,
    short: entry.short || entry.shortDescription || "",
    description: entry.description || "",
    sections: Array.isArray(entry.sections) ? entry.sections : [],
    links: Array.isArray(entry.links) ? entry.links : [],
    categoryId: category.id,
    categoryName: category.name
  };
}

function buildRingDom() {
  ring.innerHTML = "";

  for (const category of categories) {
    const cylinder = document.createElement("section");
    cylinder.className = "category-cylinder";
    cylinder.setAttribute("aria-label", `${category.name} cylinder`);

    const title = document.createElement("button");
    title.className = "cylinder-title";
    title.type = "button";
    title.textContent = category.name;
    title.addEventListener("click", () => moveToCategory(category.index));
    cylinder.appendChild(title);

    for (let slot = 0; slot < VISIBLE_SEGMENTS; slot++) {
      const segment = document.createElement("button");
      segment.className = "cylinder-segment";
      segment.type = "button";
      segment.dataset.slot = String(slot);
      segment.innerHTML = `
        <span class="segment-name"></span>
        <span class="segment-type"></span>
      `;

      segment.addEventListener("pointerenter", markInteraction);
      segment.addEventListener("focus", markInteraction);
      segment.addEventListener("click", () => {
        const entryIndex = Number(segment.dataset.entryIndex || 0);
        markInteraction();
        category.targetScroll = entryIndex;
        if (selectedCategoryIndex !== category.index) moveToCategory(category.index);
        selectEntry(category.entries[entryIndex]);
      });

      category.segmentEls.push(segment);
      cylinder.appendChild(segment);
    }

    category.cylinderEl = cylinder;
    ring.appendChild(cylinder);
  }
}

function startAnimationLoop() {
  stopAnimationLoop();
  lastFrameTime = performance.now();
  animationFrame = requestAnimationFrame(renderScene);
}

function stopAnimationLoop() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
}

function renderScene(now) {
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  if (!REDUCED_MOTION) {
    const inactiveFor = Date.now() - lastInteractionTime;
    const focused = categories[selectedCategoryIndex];
    if (focused && focused.entries.length > 1 && inactiveFor > AUTO_ROTATE_AFTER_MS) {
      focused.targetScroll += AUTO_ROTATE_SPEED * deltaSeconds;
    }
  }

  categoryPosition = lerpCircular(categoryPosition, targetCategoryPosition, categories.length, REDUCED_MOTION ? 1 : LERP_SPEED);

  for (const category of categories) {
    category.scroll = lerpCircular(category.scroll, category.targetScroll, category.entries.length, REDUCED_MOTION ? 1 : LERP_SPEED);
    renderCategoryCylinder(category);
  }

  const nearestCategoryIndex = wrap(Math.round(categoryPosition), categories.length);
  if (nearestCategoryIndex !== selectedCategoryIndex) {
    selectedCategoryIndex = nearestCategoryIndex;
    updateCategoryHeader();
  }

  animationFrame = requestAnimationFrame(renderScene);
}

function renderCategoryCylinder(category) {
  const entries = category.entries;
  const ringOffset = shortestCircularDifference(category.index, categoryPosition, categories.length);
  const angle = ringOffset * RING_STEP_DEGREES;
  const radians = angle * Math.PI / 180;
  const absoluteRingOffset = Math.abs(ringOffset);
  const frontness = Math.cos(radians);
  const x = Math.sin(radians) * Math.min(window.innerWidth * 0.36, 390);
  const z = (frontness - 1) * 190;
  const scale = clamp(1 - absoluteRingOffset * 0.16, 0.54, 1);
  const opacity = clamp(1 - absoluteRingOffset * 0.24, 0.18, 1);
  const visibleEnough = absoluteRingOffset < 2.45;

  category.cylinderEl.classList.toggle("is-focused", absoluteRingOffset < 0.45);
  category.cylinderEl.classList.toggle("is-side", absoluteRingOffset >= 0.45);
  category.cylinderEl.style.transform = `translateX(${x}px) translateZ(${z}px) rotateY(${-angle * 0.42}deg) scale(${scale})`;
  category.cylinderEl.style.opacity = String(visibleEnough ? opacity : 0);
  category.cylinderEl.style.pointerEvents = visibleEnough ? "auto" : "none";
  category.cylinderEl.style.zIndex = String(Math.round(1000 + frontness * 100 - absoluteRingOffset * 10));

  const baseIndex = Math.floor(category.scroll);
  const fraction = category.scroll - baseIndex;

  for (let slot = 0; slot < VISIBLE_SEGMENTS; slot++) {
    const offset = slot - CENTER_SLOT;
    const visualOffset = offset - fraction;
    const entryIndex = wrap(baseIndex + offset, entries.length);
    const entry = entries[entryIndex];
    const segment = category.segmentEls[slot];

    segment.dataset.entryIndex = String(entryIndex);
    segment.querySelector(".segment-name").textContent = entry.name;
    segment.querySelector(".segment-type").textContent = entry.type || category.name;

    segment.classList.toggle(
      "is-selected",
      Boolean(selectedEntry && selectedEntry.categoryId === entry.categoryId && selectedEntry.slug === entry.slug)
    );

    applySegmentTransform(segment, visualOffset, absoluteRingOffset);
  }
}

function applySegmentTransform(segment, offset, ringDistance) {
  const distance = Math.abs(offset);
  const y = offset * SEGMENT_SPACING;
  const z = -distance * 34;
  const scale = clamp(1 - distance * 0.065 - ringDistance * 0.015, 0.66, 1.02);
  const opacity = clamp(1 - distance * 0.14 - ringDistance * 0.09, 0.18, 1);
  const rotateX = offset * -9.5;
  const skew = offset * -1.4;

  segment.style.transform = `translate(-50%, -50%) translateY(${y}px) translateZ(${z}px) rotateX(${rotateX}deg) skewX(${skew}deg) scale(${scale})`;
  segment.style.opacity = String(opacity);
  segment.style.zIndex = String(Math.round(200 - distance * 10));
}

function selectEntry(entry, updateHash = true) {
  selectedEntry = entry;

  const categoryIndex = categories.findIndex((category) => category.id === entry.categoryId);
  if (categoryIndex >= 0) {
    selectedCategoryIndex = categoryIndex;
    updateCategoryHeader();
  }

  detailType.textContent = entry.type || entry.categoryName || "Credit";
  detailName.textContent = entry.name;
  detailShort.textContent = entry.short || "";
  detailDescription.textContent = entry.description || "";

  detailSections.innerHTML = "";
  for (const section of entry.sections || []) {
    if (!section.title && !section.body) continue;

    const sectionEl = document.createElement("section");
    sectionEl.className = "detail-section";

    const heading = document.createElement("h3");
    heading.textContent = section.title || "Note";

    const body = document.createElement("p");
    body.textContent = section.body || "";

    sectionEl.append(heading, body);
    detailSections.appendChild(sectionEl);
  }

  detailLinks.innerHTML = "";
  for (const link of entry.links || []) {
    if (!link.label || !link.url) continue;

    const linkEl = document.createElement("a");
    linkEl.href = link.url;
    linkEl.textContent = link.label;

    if (isExternalLink(link.url)) {
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
    }

    detailLinks.appendChild(linkEl);
  }

  if (updateHash) {
    history.replaceState(null, "", `#${entry.categoryId}/${entry.slug}`);
  }
}

function moveToCategory(index) {
  markInteraction();
  targetCategoryPosition = unwrapTarget(index, targetCategoryPosition, categories.length);
  selectedCategoryIndex = wrap(Math.round(targetCategoryPosition), categories.length);
  updateCategoryHeader();

  const category = categories[selectedCategoryIndex];
  if (category && category.entries.length > 0) {
    const nearestEntryIndex = wrap(Math.round(category.targetScroll), category.entries.length);
    selectEntry(category.entries[nearestEntryIndex]);
  }
}

function rotateFocusedCylinder(amount) {
  const category = categories[selectedCategoryIndex];
  if (!category || category.entries.length <= 1) return;
  markInteraction();
  category.targetScroll += amount;
}

function updateCategoryHeader() {
  const category = categories[selectedCategoryIndex];
  if (!category) return;
  categoryName.textContent = category.name;
  categoryCounter.textContent = `${selectedCategoryIndex + 1} / ${categories.length}`;
}

function markInteraction() {
  lastInteractionTime = Date.now();
}

function parseHashLocation() {
  const hash = window.location.hash.replace(/^#/, "").trim();
  if (!hash) return {};
  const [categoryId, entrySlug] = hash.split("/").map(decodeURIComponent);
  return { categoryId, entrySlug };
}

function wrap(value, length) {
  if (length <= 0) return 0;
  return ((value % length) + length) % length;
}

function shortestCircularDifference(index, position, length) {
  let diff = index - position;
  while (diff > length / 2) diff -= length;
  while (diff < -length / 2) diff += length;
  return diff;
}

function lerpCircular(current, target, length, amount) {
  if (length <= 1) return target;
  const diff = shortestCircularDifference(target, current, length);
  return current + diff * amount;
}

function unwrapTarget(index, currentTarget, length) {
  const wrappedIndex = wrap(index, length);
  const diff = shortestCircularDifference(wrappedIndex, currentTarget, length);
  return currentTarget + diff;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isExternalLink(url) {
  return /^https?:\/\//i.test(url);
}

prevCategoryButton.addEventListener("click", () => moveToCategory(selectedCategoryIndex - 1));
nextCategoryButton.addEventListener("click", () => moveToCategory(selectedCategoryIndex + 1));

stage.addEventListener("wheel", (event) => {
  event.preventDefault();
  const verticalIntent = Math.abs(event.deltaY) >= Math.abs(event.deltaX);

  if (event.shiftKey || !verticalIntent) {
    moveToCategory(selectedCategoryIndex + (event.deltaX + event.deltaY > 0 ? 1 : -1));
    return;
  }

  rotateFocusedCylinder(event.deltaY * SCROLL_SPEED);
}, { passive: false });

stage.addEventListener("pointerenter", markInteraction);
stage.addEventListener("pointerdown", markInteraction);

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) markInteraction();

  if (event.key === "ArrowUp") {
    event.preventDefault();
    rotateFocusedCylinder(-1);
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    rotateFocusedCylinder(1);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveToCategory(selectedCategoryIndex - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveToCategory(selectedCategoryIndex + 1);
  }
});

window.addEventListener("hashchange", () => {
  const location = parseHashLocation();
  if (!location.categoryId || categories.length === 0) return;

  const categoryIndex = categories.findIndex((category) => category.id === location.categoryId);
  if (categoryIndex < 0) return;

  const category = categories[categoryIndex];
  const entryIndex = category.entries.findIndex((entry) => entry.slug === location.entrySlug);
  moveToCategory(categoryIndex);

  if (entryIndex >= 0) {
    category.targetScroll = entryIndex;
    selectEntry(category.entries[entryIndex], false);
  }
});

window.addEventListener("beforeunload", stopAnimationLoop);

loadCredits();
