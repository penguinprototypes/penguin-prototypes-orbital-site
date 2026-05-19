/**
 * Parser for simple `.orbit` files.
 *
 * Supported top-level keys:
 *   planet: /images/planet.png
 *   alt: Planet description
 *   size: 80
 *   orbit-radius: 300
 *   orbit-speed: 0.00008
 *   start-angle: 0.4
 *   orbit-line: true
 *
 * Shorthand single-moon block:
 *   moon: /images/moon.png
 *   moon-alt: Moon description
 *   moon-size: 22
 *   moon-radius: 55
 *   moon-speed: 0.0005
 *   moon-start-angle: 1.2
 *   moon-orbit-line: true
 *
 * Full ring block:
 *   ring-radius: 70
 *   ring-speed: 0.0007
 *   ring-start-angle: 0
 *   ring-orbit-line: true
 *   ring-size: 18
 *   ring-image: /images/a.png
 *   ring-image: /images/b.png
 *
 * A file may omit `planet:`. In that case, it creates an invisible
 * moving anchor, and any child rings orbit around that invisible anchor.
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

export function parseOrbitFile(rawText, sourceName = "unknown.orbit") {
  const definition = {
    sourceName,
    planetImage: null,
    alt: "",
    size: DEFAULTS.bodySize,
    orbitRadius: DEFAULTS.orbitRadius,
    orbitSpeed: DEFAULTS.orbitSpeed,
    startAngle: DEFAULTS.startAngle,
    orbitLine: DEFAULTS.orbitLine,
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
      // ---------- Top-level body / system orbit ----------
      case "planet":
        definition.planetImage = value || null;
        break;

      case "alt":
        definition.alt = value;
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
        ring.items.push({
          image: value || null,
          alt: ""
        });
        break;
      }

      case "moon-alt": {
        const ring = ensureCurrentRing();
        const latestItem = ring.items.at(-1);

        if (latestItem) {
          latestItem.alt = value;
        }
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
        ensureCurrentRing().items.push({
          image: value || null,
          alt: ""
        });
        break;

      case "ring-alt": {
        const ring = ensureCurrentRing();
        const latestItem = ring.items.at(-1);

        if (latestItem) {
          latestItem.alt = value;
        }
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
