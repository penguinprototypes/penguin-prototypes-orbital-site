/**
 * Parser for `.orbit` files.
 *
 * Planet example:
 *   planet: /images/planet.png
 *   title: The Railyard
 *   text: This becomes a paragraph in the information box.
 *   text: Repeating text creates another paragraph.
 *   link: Read more | https://example.com
 *   alt: Planet description for screen readers
 *   nav-name: Optional navigator label
 *   size: 80
 *   orbit-radius: 300
 *   orbit-speed: 0.00008
 *   start-angle: 0.4
 *   orbit-line: true
 *
 * Single moon shorthand:
 *   moon: /images/moon.png
 *   moon-title: Small Satellite
 *   moon-text: This text belongs to the moon.
 *   moon-link: Open link | https://example.com
 *   moon-alt: Moon description
 *   moon-nav-name: Optional navigator label
 *   moon-size: 22
 *   moon-radius: 55
 *   moon-speed: 0.0005
 *
 * Multi-object ring:
 *   ring-radius: 70
 *   ring-speed: 0.0007
 *   ring-size: 18
 *   ring-image: /images/a.png
 *   ring-title: Satellite A
 *   ring-text: Text for the latest ring image.
 *   ring-link: Open A | https://example.com
 *   ring-image: /images/b.png
 *   ring-title: Satellite B
 *
 * If a file has no `planet:` line, it creates an invisible moving
 * anchor. Its child ring objects still orbit around it.
 */

const DEFAULTS = Object.freeze({
  bodySize: 72,
  orbitRadius: 320,
  orbitSpeed: 0.00008,
  startAngle: 0,
  orbitLine: true,

  ringRadius: 56,
  ringSpeed: 0.00055,
  ringStartAngle: 0,
  ringOrbitLine: true,
  ringItemSize: 18
});

function parseBoolean(value, fallback = true) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();

  if (["true", "yes", "on", "1"].includes(normalized)) return true;
  if (["false", "no", "off", "0"].includes(normalized)) return false;

  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripInlineComment(line) {
  const hashIndex = line.indexOf("#");
  return hashIndex === -1 ? line : line.slice(0, hashIndex);
}

function createInfo() {
  return {
    title: "",
    paragraphs: [],
    links: []
  };
}

function parseLink(value) {
  const [rawLabel, ...urlParts] = value.split("|");
  const label = rawLabel?.trim() || "";
  const href = urlParts.join("|").trim();

  if (!href) {
    return {
      label: label || value.trim(),
      href: value.trim()
    };
  }

  return {
    label: label || href,
    href
  };
}

function createRing(overrides = {}) {
  return {
    radius: DEFAULTS.ringRadius,
    speed: DEFAULTS.ringSpeed,
    startAngle: DEFAULTS.ringStartAngle,
    orbitLine: DEFAULTS.ringOrbitLine,
    itemSize: DEFAULTS.ringItemSize,
    items: [],
    ...overrides
  };
}

function createRingItem(image = null) {
  return {
    image,
    alt: "",
    navName: "",
    info: createInfo()
  };
}

export function parseOrbitFile(rawText, sourceName = "unknown.orbit") {
  const definition = {
    sourceName,
    planetImage: null,
    alt: "",
    navName: "",
    size: DEFAULTS.bodySize,
    orbitRadius: DEFAULTS.orbitRadius,
    orbitSpeed: DEFAULTS.orbitSpeed,
    startAngle: DEFAULTS.startAngle,
    orbitLine: DEFAULTS.orbitLine,
    info: createInfo(),
    rings: []
  };

  let currentRing = null;

  function ensureCurrentRing() {
    if (!currentRing) {
      currentRing = createRing();
      definition.rings.push(currentRing);
    }
    return currentRing;
  }

  function beginRing(overrides = {}) {
    currentRing = createRing(overrides);
    definition.rings.push(currentRing);
    return currentRing;
  }

  function latestRingItem() {
    const ring = ensureCurrentRing();
    return ring.items.at(-1) || null;
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(stripInlineComment)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const colonIndex = line.indexOf(":");

    if (colonIndex === -1) {
      console.warn(`[orbit parser] Ignoring malformed line in ${sourceName}: "${line}"`);
      continue;
    }

    const rawKey = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    const key = rawKey.toLowerCase();

    switch (key) {
      // ---------- Top-level planet / system orbit ----------
      case "planet":
        definition.planetImage = value || null;
        break;

      case "title":
        definition.info.title = value;
        break;

      case "text":
        if (value) definition.info.paragraphs.push(value);
        break;

      case "link":
        if (value) definition.info.links.push(parseLink(value));
        break;

      case "alt":
        definition.alt = value;
        break;

      case "nav-name":
        definition.navName = value;
        break;

      case "size":
        definition.size = parseNumber(value, definition.size);
        break;

      case "orbit-radius":
        definition.orbitRadius = parseNumber(value, definition.orbitRadius);
        break;

      case "orbit-speed":
        definition.orbitSpeed = parseNumber(value, definition.orbitSpeed);
        break;

      case "start-angle":
        definition.startAngle = parseNumber(value, definition.startAngle);
        break;

      case "orbit-line":
        definition.orbitLine = parseBoolean(value, definition.orbitLine);
        break;

      // ---------- Single moon shorthand ----------
      case "moon": {
        const ring = beginRing();
        ring.items.push(createRingItem(value || null));
        break;
      }

      case "moon-title": {
        const item = latestRingItem();
        if (item) item.info.title = value;
        break;
      }

      case "moon-text": {
        const item = latestRingItem();
        if (item && value) item.info.paragraphs.push(value);
        break;
      }

      case "moon-link": {
        const item = latestRingItem();
        if (item && value) item.info.links.push(parseLink(value));
        break;
      }

      case "moon-alt": {
        const item = latestRingItem();
        if (item) item.alt = value;
        break;
      }

      case "moon-nav-name": {
        const item = latestRingItem();
        if (item) item.navName = value;
        break;
      }

      case "moon-size":
        ensureCurrentRing().itemSize = parseNumber(value, ensureCurrentRing().itemSize);
        break;

      case "moon-radius":
        ensureCurrentRing().radius = parseNumber(value, ensureCurrentRing().radius);
        break;

      case "moon-speed":
        ensureCurrentRing().speed = parseNumber(value, ensureCurrentRing().speed);
        break;

      case "moon-start-angle":
        ensureCurrentRing().startAngle = parseNumber(value, ensureCurrentRing().startAngle);
        break;

      case "moon-orbit-line":
        ensureCurrentRing().orbitLine = parseBoolean(value, ensureCurrentRing().orbitLine);
        break;

      // ---------- Multi-item ring block ----------
      case "ring-radius":
        beginRing({
          radius: parseNumber(value, DEFAULTS.ringRadius)
        });
        break;

      case "ring-speed":
        ensureCurrentRing().speed = parseNumber(value, ensureCurrentRing().speed);
        break;

      case "ring-start-angle":
        ensureCurrentRing().startAngle = parseNumber(value, ensureCurrentRing().startAngle);
        break;

      case "ring-orbit-line":
        ensureCurrentRing().orbitLine = parseBoolean(value, ensureCurrentRing().orbitLine);
        break;

      case "ring-size":
        ensureCurrentRing().itemSize = parseNumber(value, ensureCurrentRing().itemSize);
        break;

      case "ring-image":
        ensureCurrentRing().items.push(createRingItem(value || null));
        break;

      case "ring-title": {
        const item = latestRingItem();
        if (item) item.info.title = value;
        break;
      }

      case "ring-text": {
        const item = latestRingItem();
        if (item && value) item.info.paragraphs.push(value);
        break;
      }

      case "ring-link": {
        const item = latestRingItem();
        if (item && value) item.info.links.push(parseLink(value));
        break;
      }

      case "ring-alt": {
        const item = latestRingItem();
        if (item) item.alt = value;
        break;
      }

      case "ring-nav-name": {
        const item = latestRingItem();
        if (item) item.navName = value;
        break;
      }

      default:
        console.warn(`[orbit parser] Unknown key "${rawKey}" in ${sourceName}.`);
        break;
    }
  }

  definition.rings = definition.rings.filter(ring => ring.items.length > 0);
  return definition;
}
