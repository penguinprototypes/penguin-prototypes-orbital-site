const VISIBLE_COUNT = 7;
const CENTER_OFFSET = Math.floor(VISIBLE_COUNT / 2);
const AUTO_ROTATE_AFTER_MS = 5200;
const AUTO_ROTATE_EVERY_MS = 2800;

let categories = [];
let currentCategoryIndex = 0;
let currentEntryIndex = 0;
let selectedEntry = null;
let lastInteractionTime = Date.now();
let autoRotateTimer = null;

const cylinder = document.getElementById("cylinder");
const categoryName = document.getElementById("categoryName");
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
      categoryManifest.map(async (category) => {
        const files = Array.isArray(category.files) ? category.files : [];
        const entries = await Promise.all(
          files.map(async (file) => {
            const path = buildCreditPath(category.folder, file);
            const text = await fetchText(path);
            const entry = parseCreditFile(text, file);
            return normalizeEntry(entry, category, file);
          })
        );

        return {
          ...category,
          entries: entries.filter(Boolean)
        };
      })
    );

    categories = categories.filter((category) => category.entries.length > 0);

    if (categories.length === 0) {
      throw new Error("No credit entries were found.");
    }

    const initialLocation = parseHashLocation();
    const categoryIndex = initialLocation.categoryId
      ? categories.findIndex((category) => category.id === initialLocation.categoryId)
      : 0;

    selectCategory(categoryIndex >= 0 ? categoryIndex : 0, initialLocation.entrySlug);
    startAutoRotate();
  } catch (error) {
    console.error(error);
    cylinder.innerHTML = `<p class="error-message">Credits failed to load. Check /credits/data/categories.json and the listed .credit files.</p>`;
    categoryName.textContent = "Credits unavailable";
    detailType.textContent = "Error";
    detailName.textContent = "Credits failed to load";
    detailShort.textContent = "Check the browser console and confirm the .credit files listed in categories.json are being served from /credits/data/.";
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status}`);
  }
  return response.text();
}

function buildCreditPath(folder, file) {
  const encodedFolder = String(folder).split("/").map(encodeURIComponent).join("/");
  const encodedFile = encodeURIComponent(file);
  return `/credits/data/${encodedFolder}/${encodedFile}`;
}

function parseCreditFile(text, fileName = "") {
  const entry = {
    sections: [],
    links: []
  };

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
      entry.sections.push({
        title: title || "Note",
        body: bodyParts.join(" | ")
      });
      continue;
    }

    if (key === "link") {
      const [label, ...urlParts] = value.split("|").map((part) => part.trim());
      entry.links.push({
        label: label || "Link",
        url: urlParts.join(" | ")
      });
      continue;
    }

    entry[key] = value;
  }

  if (!entry.name && fileName) {
    entry.name = fileName.replace(/\.credit$/i, "");
  }

  return entry;
}

function normalizeEntry(entry, category, fileName = "") {
  if (!entry || !entry.name) return null;

  const slug = entry.slug || slugify(entry.name);

  return {
    ...entry,
    fileName,
    slug,
    type: entry.type || category.name,
    short: entry.short || entry.shortDescription || "",
    description: entry.description || "",
    sections: Array.isArray(entry.sections) ? entry.sections : [],
    links: Array.isArray(entry.links) ? entry.links : [],
    categoryId: category.id,
    categoryName: category.name
  };
}

function selectCategory(index, requestedEntrySlug = null) {
  markInteraction();

  currentCategoryIndex = wrap(index, categories.length);
  const category = getCurrentCategory();
  categoryName.textContent = category.name;

  const requestedIndex = requestedEntrySlug
    ? category.entries.findIndex((entry) => entry.slug === requestedEntrySlug)
    : -1;

  currentEntryIndex = requestedIndex >= 0 ? requestedIndex : 0;
  selectEntry(category.entries[currentEntryIndex], false);
  renderCylinder();
}

function getCurrentCategory() {
  return categories[currentCategoryIndex];
}

function renderCylinder() {
  const category = getCurrentCategory();
  const entries = category.entries;

  cylinder.innerHTML = "";

  if (entries.length === 1) {
    const segment = createSegment(entries[0], 0, 0);
    cylinder.appendChild(segment);
    return;
  }

  for (let visibleSlot = 0; visibleSlot < VISIBLE_COUNT; visibleSlot++) {
    const offset = visibleSlot - CENTER_OFFSET;
    const entryIndex = wrap(currentEntryIndex + offset, entries.length);
    const entry = entries[entryIndex];
    const segment = createSegment(entry, offset, entryIndex);
    cylinder.appendChild(segment);
  }
}

function createSegment(entry, offset, entryIndex) {
  const segment = document.createElement("button");
  segment.className = "cylinder-segment";
  segment.type = "button";

  if (selectedEntry && selectedEntry.categoryId === entry.categoryId && selectedEntry.slug === entry.slug) {
    segment.classList.add("is-selected");
  }

  segment.innerHTML = `
    <span class="segment-name">${escapeHtml(entry.name)}</span>
    <span class="segment-type">${escapeHtml(entry.type)}</span>
  `;

  applySegmentTransform(segment, offset);

  segment.addEventListener("pointerenter", markInteraction);
  segment.addEventListener("focus", markInteraction);

  segment.addEventListener("click", () => {
    markInteraction();
    currentEntryIndex = entryIndex;
    selectEntry(entry);
    renderCylinder();
  });

  return segment;
}

function applySegmentTransform(segment, offset) {
  const distance = Math.abs(offset);
  const y = offset * 54;
  const z = -distance * 30;
  const scale = 1 - distance * 0.066;
  const opacity = 1 - distance * 0.135;
  const rotateX = offset * -8.5;

  segment.style.transform = `translateY(${y}px) translateZ(${z}px) rotateX(${rotateX}deg) scale(${scale})`;
  segment.style.opacity = String(Math.max(opacity, 0.35));
  segment.style.zIndex = String(100 - distance);
}

function selectEntry(entry, updateHash = true) {
  selectedEntry = entry;

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
    const hash = `#${entry.categoryId}/${entry.slug}`;
    history.replaceState(null, "", hash);
  }
}

function rotateEntries(amount) {
  const category = getCurrentCategory();
  if (!category || category.entries.length <= 1) return;

  markInteraction();
  currentEntryIndex = wrap(currentEntryIndex + amount, category.entries.length);
  renderCylinder();
}

function startAutoRotate() {
  stopAutoRotate();
  autoRotateTimer = window.setInterval(() => {
    const inactiveFor = Date.now() - lastInteractionTime;
    const category = getCurrentCategory();

    if (category && category.entries.length > 1 && inactiveFor > AUTO_ROTATE_AFTER_MS) {
      currentEntryIndex = wrap(currentEntryIndex + 1, category.entries.length);
      renderCylinder();
    }
  }, AUTO_ROTATE_EVERY_MS);
}

function stopAutoRotate() {
  if (autoRotateTimer) {
    window.clearInterval(autoRotateTimer);
    autoRotateTimer = null;
  }
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
  return ((value % length) + length) % length;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isExternalLink(url) {
  return /^https?:\/\//i.test(url);
}

prevCategoryButton.addEventListener("click", () => {
  selectCategory(currentCategoryIndex - 1);
});

nextCategoryButton.addEventListener("click", () => {
  selectCategory(currentCategoryIndex + 1);
});

cylinder.addEventListener("wheel", (event) => {
  event.preventDefault();
  rotateEntries(event.deltaY > 0 ? 1 : -1);
}, { passive: false });

cylinder.addEventListener("pointerenter", markInteraction);
cylinder.addEventListener("pointerdown", markInteraction);

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    markInteraction();
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    rotateEntries(-1);
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    rotateEntries(1);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    selectCategory(currentCategoryIndex - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    selectCategory(currentCategoryIndex + 1);
  }
});

window.addEventListener("hashchange", () => {
  const location = parseHashLocation();
  if (!location.categoryId || categories.length === 0) return;

  const categoryIndex = categories.findIndex((category) => category.id === location.categoryId);
  if (categoryIndex >= 0) {
    selectCategory(categoryIndex, location.entrySlug);
  }
});

loadCredits();
