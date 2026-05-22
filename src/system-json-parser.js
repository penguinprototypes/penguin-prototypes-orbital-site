/**
 * Parser for nested `.system.json` files.
 *
 * Use these files for deeper trees such as:
 *
 * center
 * └─ star
 *    └─ planet
 *       └─ moon
 *
 * File location:
 *   src/systems/example.system.json
 *
 * Basic shape:
 * {
 *   "title": "Facility Star",
 *   "navName": "Facility System",
 *   "image": "/images/star.png",
 *   "alt": "Glowing star",
 *   "size": 120,
 *   "orbitRadius": 520,
 *   "orbitSpeed": 0.000025,
 *   "startAngle": 0.5,
 *   "orbitLine": true,
 *   "text": ["Description paragraph."],
 *   "links": [
 *     { "label": "Open", "href": "https://example.com" }
 *   ],
 *   "children": []
 * }
 */

const DEFAULTS = Object.freeze({
  size: 72,
  orbitRadius: 320,
  orbitSpeed: 0.00008,
  startAngle: 0,
  orbitLine: true
});

export function parseSystemJsonFile(rawText, sourceName = "unknown.system.json") {
  let parsed;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    console.error(`[system json parser] Could not parse ${sourceName}:`, error);
    return createFallbackBody(sourceName);
  }

  return normalizeBody(parsed, sourceName, 0);
}

function normalizeBody(body, sourceName, depth) {
  const safeBody = body && typeof body === "object" && !Array.isArray(body)
    ? body
    : {};

  const children = Array.isArray(safeBody.children)
    ? safeBody.children.map(child => normalizeBody(child, sourceName, depth + 1))
    : [];

  return {
    sourceName,
    image: typeof safeBody.image === "string" && safeBody.image.trim()
      ? safeBody.image.trim()
      : null,
    alt: typeof safeBody.alt === "string" ? safeBody.alt : "",
    navName: typeof safeBody.navName === "string" ? safeBody.navName : "",
    size: numberOrDefault(safeBody.size, DEFAULTS.size),
    orbitRadius: numberOrDefault(safeBody.orbitRadius, DEFAULTS.orbitRadius),
    orbitSpeed: numberOrDefault(safeBody.orbitSpeed, DEFAULTS.orbitSpeed),
    startAngle: numberOrDefault(safeBody.startAngle, DEFAULTS.startAngle),
    orbitEccentricity: numberOrDefault(safeBody.orbitEccentricity, 0),
    orbitRotation: numberOrDefault(safeBody.orbitRotation, 0),
    orbitPeriod: safeBody.orbitPeriod === undefined || safeBody.orbitPeriod === null
      ? null
      : numberOrDefault(safeBody.orbitPeriod, null),
    orbitLine: booleanOrDefault(safeBody.orbitLine, DEFAULTS.orbitLine),
    singleNavigator: booleanOrDefault(safeBody.singleNavigator, false),
    navigable: safeBody.navigable === undefined
      ? undefined
      : booleanOrDefault(safeBody.navigable, true),
    kindLabel: typeof safeBody.kindLabel === "string"
      ? safeBody.kindLabel
      : depth === 0
        ? "System body"
        : "Orbital body",
    info: {
      title: typeof safeBody.title === "string" ? safeBody.title : "",
      paragraphs: normalizeText(safeBody.text),
      links: normalizeLinks(safeBody.links)
    },
    children
  };
}

function createFallbackBody(sourceName) {
  return {
    sourceName,
    image: null,
    alt: "",
    navName: "",
    size: 0,
    orbitRadius: DEFAULTS.orbitRadius,
    orbitSpeed: DEFAULTS.orbitSpeed,
    startAngle: DEFAULTS.startAngle,
    orbitLine: false,
    kindLabel: "Invalid system",
    info: {
      title: "Invalid system file",
      paragraphs: [`${sourceName} could not be parsed as valid JSON.`],
      links: []
    },
    children: []
  };
}

function normalizeText(text) {
  if (Array.isArray(text)) {
    return text
      .map(value => String(value).trim())
      .filter(Boolean);
  }

  if (typeof text === "string" && text.trim()) {
    return [text.trim()];
  }

  return [];
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) {
    return [];
  }

  return links
    .map(link => {
      if (!link || typeof link !== "object") {
        return null;
      }

      const label = typeof link.label === "string" ? link.label.trim() : "";
      const href = typeof link.href === "string" ? link.href.trim() : "";

      if (!label || !href) {
        return null;
      }

      return { label, href };
    })
    .filter(Boolean);
}

function numberOrDefault(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanOrDefault(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "yes", "on", "1"].includes(normalized)) return true;
    if (["false", "no", "off", "0"].includes(normalized)) return false;
  }

  return fallback;
}
