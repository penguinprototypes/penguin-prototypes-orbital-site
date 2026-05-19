import "./style.css";
import { parseOrbitFile } from "./orbit-parser.js";

/*
  ============================================================
  CENTRAL WEBSITE CONFIGURATION
  ============================================================

  Edit this file for global scene behavior:
  - Center logo/image
  - Perspective strength
  - Depth scaling
  - Scene fitting behavior

  Add planets, moons, and sub-rings by adding `.orbit` files
  inside `src/orbits/`. You should not need to edit this file
  whenever you add a new body.
*/

const SETTINGS = {
  perspective: 0.38,
  depthScale: 0.18,
  padding: 56,
  minResponsiveScale: 0.48,

  center: {
    image: "/images/core.svg",
    alt: "Penguin Prototypes",
    size: 150
  }
};

/*
  Vite automatically finds every `.orbit` file in src/orbits/.
  Adding a new file there adds a new orbital system to the page.
*/
const rawOrbitFiles = import.meta.glob("./orbits/*.orbit", {
  query: "?raw",
  import: "default",
  eager: true
});

const orbitDefinitions = Object.entries(rawOrbitFiles)
  .map(([path, rawText]) => parseOrbitFile(rawText, path))
  .sort((a, b) => a.sourceName.localeCompare(b.sourceName));

const scene = document.querySelector("#scene");
const bodyLayer = document.querySelector("#body-layer");
const orbitSvg = document.querySelector("#orbit-svg");

const SVG_NS = "http://www.w3.org/2000/svg";

let frameTime = 0;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const systemOrbits = [];
const localOrbits = [];
const bodies = [];
const bodyById = new Map();

const centerBody = createCenterBody();
const orbitalAnchors = createOrbitalAnchors(orbitDefinitions);

window.addEventListener("resize", () => {
  frameTime = 0;
});

window.matchMedia("(prefers-reduced-motion: reduce)")
  .addEventListener("change", event => {
    reducedMotion = event.matches;
  });

requestAnimationFrame(animate);

/* ============================================================
   SCENE CREATION
   ============================================================ */

function createOrbitalAnchors(definitions) {
  return definitions.map((definition, index) => {
    const anchor = createBody({
      id: `anchor-${index}`,
      image: definition.planetImage,
      alt: definition.alt,
      size: definition.size,
      visible: Boolean(definition.planetImage),
      radius: definition.orbitRadius,
      speed: definition.orbitSpeed,
      angle: definition.startAngle,
      hostId: "SCENE_CENTER",
      layerKind: "system"
    });

    if (definition.orbitLine) {
      const orbit = createSystemOrbit(definition.orbitRadius, index === 0);
      systemOrbits.push({ ellipse: orbit, radius: definition.orbitRadius });
    }

    definition.rings.forEach((ring, ringIndex) => {
      createChildRing({
        hostBody: anchor,
        ring,
        ringIndex
      });
    });

    return anchor;
  });
}

function createChildRing({ hostBody, ring, ringIndex }) {
  if (ring.orbitLine) {
    const localOrbit = createLocalOrbit();
    localOrbits.push({
      ellipse: localOrbit,
      hostId: hostBody.id,
      radius: ring.radius
    });
  }

  ring.items.forEach((item, itemIndex) => {
    const itemAngle =
      ring.startAngle +
      evenlySpacedAngle(itemIndex, ring.items.length);

    createBody({
      id: `${hostBody.id}-ring-${ringIndex}-item-${itemIndex}`,
      image: item.image,
      alt: item.alt,
      size: ring.itemSize,
      visible: Boolean(item.image),
      radius: ring.radius,
      speed: ring.speed,
      angle: itemAngle,
      hostId: hostBody.id,
      layerKind: "local"
    });
  });
}

function createCenterBody() {
  const center = createBody({
    id: "CENTER_BODY",
    image: SETTINGS.center.image,
    alt: SETTINGS.center.alt,
    size: SETTINGS.center.size,
    visible: Boolean(SETTINGS.center.image),
    radius: 0,
    speed: 0,
    angle: 0,
    hostId: "SCENE_CENTER",
    layerKind: "center"
  });

  center.node?.classList.add("center-body");
  return center;
}

function createBody({
  id,
  image,
  alt,
  size,
  visible,
  radius,
  speed,
  angle,
  hostId,
  layerKind
}) {
  const body = {
    id,
    image,
    alt,
    baseSize: size,
    visible,
    radius,
    speed,
    angle,
    hostId,
    layerKind,

    node: visible ? createBodyNode({ image, alt }) : null,

    x: 0,
    y: 0,
    scale: 1,
    responsiveScale: 1,
    frontness: 0.5,
    zIndex: 500
  };

  bodies.push(body);
  bodyById.set(id, body);

  return body;
}

function createBodyNode({ image, alt }) {
  const node = document.createElement("div");
  node.className = "body";

  if (image) {
    const img = document.createElement("img");
    img.className = "body-image";
    img.src = image;
    img.alt = alt || "";
    img.draggable = false;
    node.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "fallback-body";
    node.appendChild(fallback);
  }

  bodyLayer.appendChild(node);
  return node;
}

function createSystemOrbit(radius, primary = false) {
  const ellipse = document.createElementNS(SVG_NS, "ellipse");
  ellipse.classList.add("system-orbit");

  if (primary) {
    ellipse.classList.add("primary");
  }

  orbitSvg.appendChild(ellipse);
  return ellipse;
}

function createLocalOrbit() {
  const ellipse = document.createElementNS(SVG_NS, "ellipse");
  ellipse.classList.add("local-orbit");
  orbitSvg.appendChild(ellipse);
  return ellipse;
}

/* ============================================================
   FRAME UPDATE
   ============================================================ */

function animate(timestamp) {
  const metrics = getSceneMetrics();
  const responsiveScale = calculateResponsiveScale(metrics);

  updateOrbitSvg(metrics);
  updateCenterBody(metrics, responsiveScale);
  updateSystemOrbits(metrics, responsiveScale);
  updateBodies(timestamp, metrics, responsiveScale);
  updateLocalOrbits(responsiveScale);

  frameTime = timestamp;
  requestAnimationFrame(animate);
}

function updateCenterBody(metrics, responsiveScale) {
  centerBody.x = metrics.cx;
  centerBody.y = metrics.cy;
  centerBody.zIndex = 500;
  centerBody.frontness = 0.5;
  centerBody.responsiveScale = responsiveScale;

  placeVisibleBody(centerBody, {
    x: metrics.cx,
    y: metrics.cy,
    depthScale: 1,
    responsiveScale,
    zIndex: 500,
    opacity: 1
  });
}

function updateSystemOrbits(metrics, responsiveScale) {
  systemOrbits.forEach(({ ellipse, radius }) => {
    ellipse.setAttribute("cx", String(metrics.cx));
    ellipse.setAttribute("cy", String(metrics.cy));
    ellipse.setAttribute("rx", String(radius * responsiveScale));
    ellipse.setAttribute("ry", String(radius * SETTINGS.perspective * responsiveScale));
  });
}

function updateBodies(timestamp, metrics, responsiveScale) {
  const deltaMs = frameTime === 0 ? 16 : Math.min(48, timestamp - frameTime);

  bodies.forEach(body => {
    if (body.layerKind === "center") {
      return;
    }

    if (!reducedMotion) {
      body.angle += body.speed * deltaMs;
    }

    const host = getHostPosition(body.hostId, metrics);
    const scaledRadius = body.radius * responsiveScale;

    const x = host.x + Math.cos(body.angle) * scaledRadius;
    const y = host.y + Math.sin(body.angle) * scaledRadius * SETTINGS.perspective;

    const frontness = (Math.sin(body.angle) + 1) / 2;
    const depthScale =
      1 - SETTINGS.depthScale / 2 +
      frontness * SETTINGS.depthScale;

    const zIndex = calculateZIndex(body.layerKind, host.zIndex, frontness);

    body.x = x;
    body.y = y;
    body.frontness = frontness;
    body.scale = depthScale;
    body.responsiveScale = responsiveScale;
    body.zIndex = zIndex;

    placeVisibleBody(body, {
      x,
      y,
      depthScale,
      responsiveScale,
      zIndex,
      opacity: 0.84 + frontness * 0.16
    });
  });
}

function updateLocalOrbits(responsiveScale) {
  localOrbits.forEach(({ ellipse, hostId, radius }) => {
    const host = bodyById.get(hostId);

    if (!host) {
      return;
    }

    ellipse.setAttribute("cx", String(host.x));
    ellipse.setAttribute("cy", String(host.y));
    ellipse.setAttribute("rx", String(radius * responsiveScale));
    ellipse.setAttribute("ry", String(radius * SETTINGS.perspective * responsiveScale));
  });
}

function placeVisibleBody(body, {
  x,
  y,
  depthScale,
  responsiveScale,
  zIndex,
  opacity
}) {
  if (!body.node) {
    return;
  }

  const visualSize = body.baseSize * responsiveScale;
  body.node.style.width = `${visualSize}px`;
  body.node.style.height = `${visualSize}px`;
  body.node.style.zIndex = String(zIndex);
  body.node.style.opacity = String(opacity);
  body.node.style.transform =
    `translate(${x - visualSize / 2}px, ${y - visualSize / 2}px) scale(${depthScale})`;
}

/* ============================================================
   POSITIONING HELPERS
   ============================================================ */

function getHostPosition(hostId, metrics) {
  if (hostId === "SCENE_CENTER") {
    return {
      x: metrics.cx,
      y: metrics.cy,
      zIndex: 500
    };
  }

  const host = bodyById.get(hostId);

  if (!host) {
    return {
      x: metrics.cx,
      y: metrics.cy,
      zIndex: 500
    };
  }

  return {
    x: host.x,
    y: host.y,
    zIndex: host.zIndex
  };
}

function calculateZIndex(layerKind, hostZIndex, frontness) {
  if (layerKind === "system") {
    return frontness >= 0.5
      ? 700 + Math.round(frontness * 100)
      : 200 + Math.round(frontness * 100);
  }

  if (layerKind === "local") {
    return hostZIndex + (frontness >= 0.5 ? 8 : -8);
  }

  return 500;
}

function getSceneMetrics() {
  return {
    width: scene.clientWidth,
    height: scene.clientHeight,
    cx: scene.clientWidth / 2,
    cy: scene.clientHeight / 2 + 18
  };
}

function calculateResponsiveScale(metrics) {
  const maximumExtent = calculateMaximumLogicalExtent();

  if (maximumExtent <= 0) {
    return 1;
  }

  const usableWidth = Math.max(1, metrics.width - SETTINGS.padding * 2);
  const usableHeight = Math.max(1, metrics.height - SETTINGS.padding * 2);

  const fitByWidth = usableWidth / (maximumExtent * 2);
  const fitByHeight =
    usableHeight /
    (maximumExtent * SETTINGS.perspective * 2 + SETTINGS.center.size);

  const rawScale = Math.min(1, fitByWidth, fitByHeight);

  return Math.max(SETTINGS.minResponsiveScale, rawScale);
}

function calculateMaximumLogicalExtent() {
  let maxExtent = SETTINGS.center.size / 2;

  orbitDefinitions.forEach(definition => {
    const baseBodyHalfSize = definition.size / 2;
    const largestChildRing = definition.rings.reduce((largest, ring) => {
      const ringExtent = ring.radius + ring.itemSize / 2;
      return Math.max(largest, ringExtent);
    }, 0);

    const definitionExtent =
      definition.orbitRadius +
      Math.max(baseBodyHalfSize, largestChildRing);

    maxExtent = Math.max(maxExtent, definitionExtent);
  });

  return maxExtent;
}

function updateOrbitSvg(metrics) {
  orbitSvg.setAttribute("viewBox", `0 0 ${metrics.width} ${metrics.height}`);
}

function evenlySpacedAngle(index, count) {
  if (count <= 1) {
    return 0;
  }

  return (Math.PI * 2 * index) / count;
}
