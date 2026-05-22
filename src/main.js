import "./style.css";
import { parseOrbitFile } from "./orbit-parser.js";
import { parseSystemJsonFile } from "./system-json-parser.js";
import { SITE } from "./site-config.js";

/*
  ============================================================
  CONTENT LOCATIONS
  ============================================================

  Main page text, center image, background, and global motion:
    src/site-config.js

  Planets, moons, rings, info boxes, and hyperlinks:
    src/orbits/*.orbit
*/

const rawOrbitFiles = import.meta.glob("./orbits/*.orbit", {
  query: "?raw",
  import: "default",
  eager: true
});

const rawSystemFiles = import.meta.glob("./systems/*.system.json", {
  query: "?raw",
  import: "default",
  eager: true
});

const orbitDefinitions = Object.entries(rawOrbitFiles)
  .map(([path, rawText]) => parseOrbitFile(rawText, path))
  .sort((a, b) => a.sourceName.localeCompare(b.sourceName));

const systemDefinitions = Object.entries(rawSystemFiles)
  .map(([path, rawText]) => parseSystemJsonFile(rawText, path))
  .sort((a, b) => a.sourceName.localeCompare(b.sourceName));

const rootDefinitions = [
  ...orbitDefinitions.map(convertOrbitDefinitionToTree),
  ...systemDefinitions
].sort((a, b) => a.sourceName.localeCompare(b.sourceName));

const scene = document.querySelector("#scene");
const bodyLayer = document.querySelector("#body-layer");
const orbitSvg = document.querySelector("#orbit-svg");
const stars = document.querySelector("#stars");
const backgroundLayer = document.querySelector("#background-layer");
const introFade = document.querySelector("#intro-fade");

const siteTitle = document.querySelector("#site-title");
const siteSubtitle = document.querySelector("#site-subtitle");
const siteFooter = document.querySelector("#site-footer");

const infoPanel = document.querySelector("#info-panel");
const panelClose = document.querySelector("#panel-close");
const panelKind = document.querySelector("#panel-kind");
const panelTitle = document.querySelector("#panel-title");
const panelCopy = document.querySelector("#panel-copy");
const panelLinks = document.querySelector("#panel-links");

const navigatorEl = document.querySelector("#object-navigator");
const navPrev = document.querySelector("#nav-prev");
const navNext = document.querySelector("#nav-next");
const navCurrent = document.querySelector("#nav-current");
const navCount = document.querySelector("#nav-count");
const navName = document.querySelector("#nav-name");

const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const zoomResetButton = document.querySelector("#zoom-reset");

const SVG_NS = "http://www.w3.org/2000/svg";

let frameTime = 0;
let lastRenderedTimestamp = 0;
let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let pageHidden = document.hidden;
let starResizeTimer = null;
let selectedBodyId = null;
let selectedIndex = 0;
let introStarted = false;

const pointer = {
  normalizedX: 0,
  normalizedY: 0,
  parallaxX: 0,
  parallaxY: 0,
  targetParallaxX: 0,
  targetParallaxY: 0
};

const camera = {
  x: 0,
  y: 0,
  scale: 1,
  targetX: 0,
  targetY: 0,
  targetScale: 1,
  renderedX: 0,
  renderedY: 0,
  manualZoom: 1,
  panX: 0,
  panY: 0
};

const dragPan = {
  active: false,
  moved: false,
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  startPanX: 0,
  startPanY: 0
};

const systemOrbits = [];
const localOrbits = [];
const bodies = [];
const bodyById = new Map();
const selectableBodies = [];
const navigationItems = [];

applySiteConfig();
generateRandomStarfield();
prepareIntroShell();

if (SITE.interaction?.dragPanEnabled) {
  scene.classList.add("drag-pan-enabled");
}

const centerBody = createCenterBody();
createBodyTrees(rootDefinitions);
finalizeNavigator();
startIntroAnimation();

window.addEventListener("resize", () => {
  frameTime = 0;
  lastRenderedTimestamp = 0;

  if (SITE.stars?.enabled !== false && SITE.stars?.regenerateOnResize !== false) {
    window.clearTimeout(starResizeTimer);
    starResizeTimer = window.setTimeout(() => {
      generateRandomStarfield();
    }, 180);
  }
});

document.addEventListener("visibilitychange", () => {
  pageHidden = document.hidden;
  frameTime = 0;
  lastRenderedTimestamp = 0;
});

window.matchMedia("(prefers-reduced-motion: reduce)")
  .addEventListener("change", event => {
    reducedMotion = event.matches;
  });

window.addEventListener("pointermove", handlePointerMove, { passive: true });
window.addEventListener("pointerleave", resetPointerParallax, { passive: true });
window.addEventListener("keydown", handleKeydown);
scene.addEventListener("wheel", handleWheelZoom, { passive: false });

scene.addEventListener("pointerdown", beginDragPan);
window.addEventListener("pointermove", continueDragPan, { passive: false });
window.addEventListener("pointerup", endDragPan);
window.addEventListener("pointercancel", endDragPan);

scene.addEventListener("click", event => {
  if (dragPan.moved) {
    dragPan.moved = false;
    return;
  }

  if (event.target.closest(".body") || event.target.closest(".info-panel")) {
    return;
  }

  selectOverview();
});

panelClose.addEventListener("click", clearSelection);

navPrev.addEventListener("click", () => navigateBy(-1));
navNext.addEventListener("click", () => navigateBy(1));
navCurrent.addEventListener("click", () => {
  if (navigationItems.length === 0) return;
  selectByIndex(selectedIndex);
});

zoomInButton.addEventListener("click", () => adjustManualZoom(SITE.interaction.manualZoomStep));
zoomOutButton.addEventListener("click", () => adjustManualZoom(-SITE.interaction.manualZoomStep));
zoomResetButton.addEventListener("click", resetView);

if (SITE.navigator.selectFirstObjectOnLoad && navigationItems.length > 0) {
  requestAnimationFrame(() => selectByIndex(0));
}

requestAnimationFrame(animate);

/* ============================================================
   GLOBAL SITE CONFIGURATION
   ============================================================ */

function applySiteConfig() {
  document.title = SITE.browserTitle || "Penguin Prototypes";

  siteTitle.textContent = SITE.header?.title || "";
  siteSubtitle.textContent = SITE.header?.subtitle || "";
  siteFooter.textContent = SITE.footer || "";

  const root = document.documentElement;

  root.style.setProperty("--bg", SITE.background?.baseColor || "#050912");
  root.style.setProperty("--glow-a", SITE.background?.glowA || "rgba(48, 112, 176, 0.18)");
  root.style.setProperty("--glow-b", SITE.background?.glowB || "rgba(115, 92, 255, 0.08)");
  root.style.setProperty("--glow-c", SITE.background?.glowC || "rgba(64, 166, 255, 0.07)");
  root.style.setProperty("--bg-image-opacity", String(SITE.background?.imageOpacity ?? 0.28));
  root.style.setProperty("--bg-image-size", SITE.background?.imageSize || "cover");
  root.style.setProperty("--bg-image-position", SITE.background?.imagePosition || "center center");
  root.style.setProperty("--hover-scale", String(SITE.interaction?.hoverScale ?? 1.18));
  root.style.setProperty("--selected-scale", String(SITE.interaction?.selectedScale ?? 1.30));

  backgroundLayer.style.backgroundImage = SITE.background?.image
    ? `url("${SITE.background.image}")`
    : "none";

  navigatorEl.classList.toggle("hidden", SITE.navigator?.visible === false);

  const performanceEnabled = SITE.performance?.enabled === true;
  document.body.classList.toggle(
    "performance-no-blur",
    performanceEnabled && SITE.performance?.useBackdropBlur === false
  );
  document.body.classList.toggle(
    "performance-no-moving-shadows",
    performanceEnabled && SITE.performance?.useMovingDropShadows === false
  );
}

/* ============================================================
   RANDOM STARFIELD
   ============================================================ */

function generateRandomStarfield() {
  if (!stars || SITE.stars?.enabled === false) {
    if (stars) {
      stars.style.backgroundImage = "none";
    }
    return;
  }

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const count = Math.max(0, Number(SITE.stars?.count ?? 260));
  const minSize = Math.max(1, Number(SITE.stars?.minSizePx ?? 1));
  const maxSize = Math.max(minSize, Number(SITE.stars?.maxSizePx ?? 2));
  const minOpacity = clamp(Number(SITE.stars?.minOpacity ?? 0.22), 0, 1);
  const maxOpacity = clamp(Number(SITE.stars?.maxOpacity ?? 0.92), minOpacity, 1);

  const rects = [];

  for (let i = 0; i < count; i += 1) {
    const size = randomRange(minSize, maxSize);
    const x = randomRange(0, Math.max(0, width - size));
    const y = randomRange(0, Math.max(0, height - size));
    const opacity = randomRange(minOpacity, maxOpacity);

    rects.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" fill="white" fill-opacity="${opacity.toFixed(3)}"/>`
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

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

/* ============================================================
   SCENE CREATION
   ============================================================ */

function convertOrbitDefinitionToTree(definition) {
  const rootBody = {
    sourceName: definition.sourceName,
    image: definition.planetImage,
    alt: definition.alt,
    navName: definition.navName,
    size: definition.planetImage ? definition.size : 0,
    orbitRadius: definition.orbitRadius,
    orbitSpeed: definition.orbitSpeed,
    startAngle: definition.startAngle,
    orbitEccentricity: definition.orbitEccentricity ?? 0,
    orbitRotation: definition.orbitRotation ?? 0,
    orbitPeriod: definition.orbitPeriod ?? null,
    orbitLine: definition.orbitLine,
    kindLabel: definition.planetImage ? "Planet" : "Invisible anchor",
    info: definition.info,
    children: []
  };

  definition.rings.forEach((ring, ringIndex) => {
    ring.items.forEach((item, itemIndex) => {
      rootBody.children.push({
        sourceName: `${definition.sourceName}#ring-${ringIndex}-item-${itemIndex}`,
        image: item.image,
        alt: item.alt,
        navName: item.navName,
        size: ring.itemSize,
        orbitRadius: ring.radius,
        orbitSpeed: ring.speed,
        startAngle:
          ring.startAngle +
          evenlySpacedAngle(itemIndex, ring.items.length),
        orbitEccentricity: ring.eccentricity ?? 0,
        orbitRotation: ring.orbitRotation ?? 0,
        orbitPeriod: ring.period ?? null,
        orbitLine: ring.orbitLine,
        kindLabel: ring.items.length === 1 ? "Moon" : "Orbiting object",
        info: item.info,
        children: []
      });
    });
  });

  return rootBody;
}

function createBodyTrees(definitions) {
  return definitions.map((definition, index) => {
    return createBodyTree({
      definition,
      hostId: "SCENE_CENTER",
      depth: 0,
      indexPath: `${index}`
    });
  });
}

function createBodyTree({
  definition,
  hostId,
  depth,
  indexPath,
  singleNavigator = false,
  navigatorRootId = null
}) {
  const isRootBody = hostId === "SCENE_CENTER";
  const currentSingleNavigator = singleNavigator || definition.singleNavigator === true;
  const navigable = definition.navigable ?? !(currentSingleNavigator && depth > 0);
  const clickFocusId =
    currentSingleNavigator && depth > 0 && navigatorRootId
      ? navigatorRootId
      : null;

  const body = createBody({
    id: `tree-${indexPath}`,
    image: definition.image,
    alt: definition.alt,
    navName: definition.navName,
    size: definition.size,
    visible: Boolean(definition.image),
    radius: definition.orbitRadius,
    speed: definition.orbitSpeed,
    angle: definition.startAngle,
    eccentricity: definition.orbitEccentricity ?? 0,
    orbitRotation: definition.orbitRotation ?? 0,
    period: definition.orbitPeriod ?? null,
    hostId,
    layerKind: isRootBody ? "system" : "local",
    kindLabel: definition.kindLabel || (isRootBody ? "System body" : "Orbital body"),
    info: definition.info,
    selectableOverride: definition.selectable,
    navigable,
    clickFocusId,
    hitRadius: definition.hitRadius ?? null
  });

  if (definition.orbitLine) {
    if (isRootBody) {
      const orbit = createSystemOrbit(depth === 0);
      systemOrbits.push({
        ellipse: orbit,
        radius: definition.orbitRadius,
        eccentricity: definition.orbitEccentricity ?? 0,
        orbitRotation: definition.orbitRotation ?? 0
      });
    } else {
      const localOrbit = createLocalOrbit();
      localOrbits.push({
        ellipse: localOrbit,
        hostId,
        radius: definition.orbitRadius,
        eccentricity: definition.orbitEccentricity ?? 0,
        orbitRotation: definition.orbitRotation ?? 0
      });
    }
  }

  definition.children.forEach((child, childIndex) => {
    createBodyTree({
      definition: child,
      hostId: body.id,
      depth: depth + 1,
      indexPath: `${indexPath}-${childIndex}`,
      singleNavigator: currentSingleNavigator,
      navigatorRootId: navigatorRootId || body.id
    });
  });

  return body;
}


function createCenterBody() {
  const centerInfo = convertSiteInfo(SITE.center?.info);

  const center = createBody({
    id: "CENTER_BODY",
    image: SITE.center?.image || "",
    alt: SITE.center?.alt || "",
    navName: SITE.center?.info?.title || "Center",
    size: SITE.center?.size || 150,
    visible: Boolean(SITE.center?.image),
    radius: 0,
    speed: 0,
    angle: 0,
    eccentricity: 0,
    orbitRotation: 0,
    period: null,
    hostId: "SCENE_CENTER",
    layerKind: "center",
    kindLabel: "Center",
    info: centerInfo,
    selectableOverride: Boolean(SITE.center?.interactive)
  });

  center.node?.classList.add("center-body");


  return center;
}

function createBody({
  id,
  image,
  alt,
  navName,
  size,
  visible,
  radius,
  speed,
  angle,
  eccentricity = 0,
  orbitRotation = 0,
  period = null,
  hostId,
  layerKind,
  kindLabel,
  info,
  selectableOverride = null,
  navigable = true,
  clickFocusId = null,
  hitRadius = null
}) {
  const normalizedInfo = normalizeInfo(info);
  const hasInfo = hasDisplayableInfo(normalizedInfo);
  const selectable =
    visible &&
    (selectableOverride === null ? true : selectableOverride);

  const body = {
    id,
    image,
    alt,
    navName,
    baseSize: size,
    visible,
    radius,
    speed,
    angle,
    eccentricity,
    orbitRotation,
    period,
    meanAnomaly: angle,
    hostId,
    layerKind,
    kindLabel,
    info: normalizedInfo,
    hasInfo,
    selectable,
    navigable,
    clickFocusId,
    hitRadius,

    node: visible
      ? createBodyNode({ image, alt, bodyId: id, selectable, hitRadius })
      : null,

    x: 0,
    y: 0,
    scale: 1,
    responsiveScale: 1,
    frontness: 0.5,
    zIndex: 500,
    renderedVisualSize: null,
    renderedZIndex: null,
    renderedOpacity: null,
    renderedTransform: null
  };

  bodies.push(body);
  bodyById.set(id, body);


  if (body.node && selectable) {
    if (navigable) {
      selectableBodies.push(body);
    }

    body.node.addEventListener("click", event => {
      event.stopPropagation();
      selectBody(id);
    });

    body.node.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectBody(id);
      }
    });
  }

  return body;
}

function createBodyNode({ image, alt, bodyId, selectable, hitRadius = null }) {
  const node = document.createElement("div");
  node.className = `body${selectable ? " selectable" : ""}`;
  node.dataset.bodyId = bodyId;

  if (selectable) {
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", alt ? `Focus ${alt}` : "Focus orbital object");
  }

  if (selectable && hitRadius && hitRadius > 0) {
    const hitArea = document.createElement("div");
    hitArea.className = "body-hit-area";
    hitArea.style.position = "absolute";
    hitArea.style.left = "50%";
    hitArea.style.top = "50%";
    hitArea.style.width = `${hitRadius * 2}px`;
    hitArea.style.height = `${hitRadius * 2}px`;
    hitArea.style.borderRadius = "9999px";
    hitArea.style.transform = "translate(-50%, -50%)";
    hitArea.style.background = "transparent";
    hitArea.style.pointerEvents = "auto";
    hitArea.style.zIndex = "-1";
    node.appendChild(hitArea);
  }

  const visual = document.createElement("div");
  visual.className = "body-visual";

  if (image) {
    const img = document.createElement("img");
    img.className = "body-image";
    img.src = image;
    img.alt = alt || "";
    img.draggable = false;
    visual.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "fallback-body";
    visual.appendChild(fallback);
  }

  node.appendChild(visual);
  bodyLayer.appendChild(node);
  return node;
}

function createSystemOrbit(primary = false) {
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
   INTRO FADE
   ============================================================ */

function shouldAnimateIntro() {
  return Boolean(SITE.intro?.enabled) && !reducedMotion;
}

function prepareIntroShell() {
  if (!shouldAnimateIntro()) {
    return;
  }

  document.body.classList.add("intro-pending", "intro-running");
  document.documentElement.style.setProperty(
    "--intro-black-fade-delay",
    `${SITE.intro.blackFadeDelayMs ?? 90}ms`
  );
  document.documentElement.style.setProperty(
    "--intro-black-fade-duration",
    `${SITE.intro.blackFadeDurationMs ?? 1450}ms`
  );
}

function startIntroAnimation() {
  if (!shouldAnimateIntro() || introStarted) {
    return;
  }

  introStarted = true;
  document.body.classList.add("intro-fade-running");

  const fadeDelay = SITE.intro.blackFadeDelayMs ?? 90;
  const fadeDuration = SITE.intro.blackFadeDurationMs ?? 1450;

  window.setTimeout(() => {
    document.body.classList.remove("intro-pending", "intro-running", "intro-fade-running");
  }, fadeDelay + fadeDuration + 180);
}

/* ============================================================
   NAVIGATOR / SELECTION
   ============================================================ */

function finalizeNavigator() {
  navigationItems.length = 0;

  navigationItems.push({
    type: "overview",
    label: SITE.navigator?.overviewLabel || "Whole Solar System"
  });

  const centerEntry = selectableBodies.find(body => body.layerKind === "center");
  if (centerEntry) {
    navigationItems.push({
      type: "body",
      bodyId: centerEntry.id,
      label: SITE.navigator?.centerLabel || getBodyDisplayName(centerEntry)
    });
  }

  selectableBodies
    .filter(body => body.layerKind !== "center")
    .forEach(body => {
      navigationItems.push({
        type: "body",
        bodyId: body.id,
        label: getBodyDisplayName(body)
      });
    });

  selectedIndex = 0;
  updateNavigatorText();

  const disabled = navigationItems.length === 0;
  navPrev.disabled = disabled;
  navNext.disabled = disabled;
  navCurrent.disabled = disabled;
}

function navigateBy(direction) {
  if (navigationItems.length === 0) return;
  selectByIndex(wrapIndex(selectedIndex + direction, navigationItems.length));
}

function selectByIndex(index) {
  if (navigationItems.length === 0) return;

  const wrapped = wrapIndex(index, navigationItems.length);
  const item = navigationItems[wrapped];
  selectedIndex = wrapped;

  if (item.type === "overview") {
    selectOverview();
    selectedIndex = wrapped;
    updateNavigatorText();
    return;
  }

  selectBody(item.bodyId);
}

function selectOverview() {
  selectedBodyId = null;
  selectedIndex = Math.max(0, navigationItems.findIndex(item => item.type === "overview"));

  bodies.forEach(candidate => {
    candidate.node?.classList.remove("selected");
  });

  infoPanel.classList.remove("open");

  window.setTimeout(() => {
    if (!selectedBodyId) {
      infoPanel.hidden = true;
    }
  }, reducedMotion ? 0 : 180);

  camera.manualZoom = 1;
  camera.panX = 0;
  camera.panY = 0;

  updateNavigatorText();
}

function selectBody(bodyId) {
  const clickedBody = bodyById.get(bodyId);

  if (!clickedBody || !clickedBody.selectable) {
    return;
  }

  const infoBodyId = clickedBody.clickFocusId || bodyId;
  const infoBody = bodyById.get(infoBodyId) || clickedBody;

  // The camera and textbox anchor follow the body that was actually clicked,
  // while the information content and navigator entry can point to a shared parent.
  selectedBodyId = clickedBody.id;

  const navIndex = navigationItems.findIndex(item => item.type === "body" && item.bodyId === infoBody.id);
  if (navIndex >= 0) {
    selectedIndex = navIndex;
  }

  bodies.forEach(candidate => {
    candidate.node?.classList.toggle("selected", candidate.id === clickedBody.id);
  });

  populateInfoPanel(infoBody);
  infoPanel.hidden = false;

  requestAnimationFrame(() => {
    infoPanel.classList.add("open");
  });

  updateNavigatorText();
}

function clearSelection() {
  selectOverview();
}

function resetView() {
  selectOverview();
}

function updateNavigatorText() {
  if (navigationItems.length === 0) {
    navCount.textContent = "0 / 0";
    navName.textContent = "No objects";
    return;
  }

  const item = navigationItems[selectedIndex] || navigationItems[0];
  navCount.textContent = `${selectedIndex + 1} / ${navigationItems.length}`;

  if (item.type === "overview") {
    navName.textContent = item.label;
    return;
  }

  const body = bodyById.get(item.bodyId);
  navName.textContent = item.label || (body ? getBodyDisplayName(body) : "Orbital object");
}

/* ============================================================
   FRAME UPDATE
   ============================================================ */

function animate(timestamp) {
  requestAnimationFrame(animate);

  const performanceEnabled = SITE.performance?.enabled === true;

  if (performanceEnabled && SITE.performance?.pauseWhenHidden === true && pageHidden) {
    return;
  }

  const targetFps = performanceEnabled ? Number(SITE.performance?.targetFps || 0) : 0;
  const minimumFrameGap = targetFps > 0 ? 1000 / targetFps : 0;

  if (
    minimumFrameGap > 0 &&
    lastRenderedTimestamp > 0 &&
    timestamp - lastRenderedTimestamp < minimumFrameGap
  ) {
    return;
  }

  lastRenderedTimestamp = timestamp;

  const metrics = getSceneMetrics();
  const responsiveScale = calculateResponsiveScale(metrics);

  updatePointerParallax();
  updateOrbitSvg(metrics);
  updateCenterBody(metrics, responsiveScale);
  updateSystemOrbits(metrics, responsiveScale);
  updateBodies(timestamp, metrics, responsiveScale);
  updateLocalOrbits(responsiveScale);
  updateCamera(metrics);
  applyWorldTransform();
  updateInfoPanelPosition(metrics);

  frameTime = timestamp;
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
  systemOrbits.forEach(({ ellipse, radius, eccentricity, orbitRotation }) => {
    updateOrbitEllipse({
      ellipse,
      cx: metrics.cx,
      cy: metrics.cy,
      radius: radius * responsiveScale,
      eccentricity,
      orbitRotation,
      perspective: SITE.scene.perspective
    });
  });
}

function updateBodies(timestamp, metrics, responsiveScale) {
  const deltaMs = frameTime === 0 ? 16 : Math.min(48, timestamp - frameTime);

  bodies.forEach(body => {
    if (body.layerKind === "center") {
      return;
    }

    if (!reducedMotion) {
      advanceOrbit(body, deltaMs);
    }

    const host = getHostPosition(body.hostId, metrics);
    const scaledRadius = body.radius * responsiveScale;
    const orbitPosition = getOrbitPosition({
      radius: scaledRadius,
      meanAnomaly: body.meanAnomaly,
      eccentricity: body.eccentricity,
      orbitRotationDegrees: body.orbitRotation
    });

    const x = host.x + orbitPosition.x;
    const y = host.y + orbitPosition.y * SITE.scene.perspective;

    const frontness = clamp((orbitPosition.unrotatedY / Math.max(1, scaledRadius) + 1) / 2, 0, 1);
    const depthScale =
      1 - SITE.scene.depthScale / 2 +
      frontness * SITE.scene.depthScale;

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
  localOrbits.forEach(({ ellipse, hostId, radius, eccentricity, orbitRotation }) => {
    const host = bodyById.get(hostId);

    if (!host) {
      return;
    }

    updateOrbitEllipse({
      ellipse,
      cx: host.x,
      cy: host.y,
      radius: radius * responsiveScale,
      eccentricity,
      orbitRotation,
      perspective: SITE.scene.perspective
    });
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
  const transform =
    `translate(${x - visualSize / 2}px, ${y - visualSize / 2}px) scale(${depthScale})`;
  const opacityString = String(opacity);
  const zIndexString = String(zIndex);

  if (body.renderedVisualSize !== visualSize) {
    body.node.style.width = `${visualSize}px`;
    body.node.style.height = `${visualSize}px`;
    body.renderedVisualSize = visualSize;
  }

  if (body.renderedZIndex !== zIndexString) {
    body.node.style.zIndex = zIndexString;
    body.renderedZIndex = zIndexString;
  }

  if (body.renderedOpacity !== opacityString) {
    body.node.style.opacity = opacityString;
    body.renderedOpacity = opacityString;
  }

  if (body.renderedTransform !== transform) {
    body.node.style.transform = transform;
    body.renderedTransform = transform;
  }
}

function updateCamera(metrics) {
  const selectedBody = selectedBodyId ? bodyById.get(selectedBodyId) : null;
  const focusZoom = selectedBody
    ? (metrics.width < 840 ? SITE.interaction.clickZoomScaleMobile : SITE.interaction.clickZoomScaleDesktop)
    : 1;

  const finalTargetScale = camera.manualZoom * focusZoom;

  if (selectedBody) {
    const focusPoint = metrics.width < 840
      ? { x: metrics.width * 0.5, y: metrics.height * 0.34 }
      : { x: metrics.width * 0.39, y: metrics.height * 0.5 };

    camera.targetScale = finalTargetScale;
    camera.targetX = focusPoint.x - selectedBody.x * finalTargetScale + camera.panX;
    camera.targetY = focusPoint.y - selectedBody.y * finalTargetScale + camera.panY;
  } else {
    camera.targetScale = finalTargetScale;
    camera.targetX = metrics.cx - metrics.cx * finalTargetScale + camera.panX;
    camera.targetY = metrics.cy - metrics.cy * finalTargetScale + camera.panY;
  }

  const lerpAmount = reducedMotion ? 1 : SITE.interaction.cameraLerp;
  camera.scale = lerp(camera.scale, camera.targetScale, lerpAmount);
  camera.x = lerp(camera.x, camera.targetX, lerpAmount);
  camera.y = lerp(camera.y, camera.targetY, lerpAmount);

  camera.renderedX = camera.x + pointer.parallaxX;
  camera.renderedY = camera.y + pointer.parallaxY;
}

function applyWorldTransform() {
  scene.style.setProperty("--world-x", `${camera.renderedX}px`);
  scene.style.setProperty("--world-y", `${camera.renderedY}px`);
  scene.style.setProperty("--world-scale", String(camera.scale));

  stars.style.setProperty("--stars-x", `${pointer.parallaxX * SITE.interaction.starParallaxMultiplier}px`);
  stars.style.setProperty("--stars-y", `${pointer.parallaxY * SITE.interaction.starParallaxMultiplier}px`);
}

/* ============================================================
   INFORMATION PANEL
   ============================================================ */

function populateInfoPanel(body) {
  panelKind.textContent = body.kindLabel || "Object";
  panelTitle.textContent = getBodyDisplayName(body);

  panelCopy.replaceChildren();
  panelLinks.replaceChildren();

  const paragraphs = body.info.paragraphs.length
    ? body.info.paragraphs
    : ["Details pending."];

  paragraphs.forEach(paragraphText => {
    const paragraph = document.createElement("p");
    paragraph.textContent = paragraphText;
    panelCopy.appendChild(paragraph);
  });

  body.info.links
    .map(sanitizeLink)
    .filter(Boolean)
    .forEach(link => {
      const anchor = document.createElement("a");
      anchor.className = "panel-link";
      anchor.href = link.href;
      anchor.textContent = link.label;
      anchor.target = isExternalHttpLink(link.href) ? "_blank" : "_self";
      anchor.rel = isExternalHttpLink(link.href) ? "noreferrer noopener" : "";
      panelLinks.appendChild(anchor);
    });
}

function updateInfoPanelPosition(metrics) {
  const selectedBody = selectedBodyId ? bodyById.get(selectedBodyId) : null;

  if (!selectedBody || infoPanel.hidden) {
    return;
  }

  const bodyScreen = worldToScreen(selectedBody.x, selectedBody.y);
  const radius =
    selectedBody.baseSize *
    selectedBody.responsiveScale *
    selectedBody.scale *
    camera.scale /
    2;

  const panelWidth = infoPanel.offsetWidth || 370;
  const panelHeight = infoPanel.offsetHeight || 220;
  const margin = 18;
  const gap = 28;

  let left;
  let top;

  if (metrics.width < 840) {
    left = clamp(bodyScreen.x - panelWidth / 2, margin, metrics.width - panelWidth - margin);
    top = bodyScreen.y + radius + 24;

    if (top + panelHeight > metrics.height - margin) {
      top = bodyScreen.y - radius - panelHeight - 24;
    }
  } else {
    left = bodyScreen.x + radius + gap;
    top = bodyScreen.y - panelHeight / 2;

    if (left + panelWidth > metrics.width - margin) {
      left = bodyScreen.x - radius - gap - panelWidth;
    }
  }

  left = clamp(left, margin, metrics.width - panelWidth - margin);
  top = clamp(top, margin, metrics.height - panelHeight - margin);

  infoPanel.style.left = `${left}px`;
  infoPanel.style.top = `${top}px`;
}

/* ============================================================
   POINTER / KEYBOARD / ZOOM
   ============================================================ */

function handlePointerMove(event) {
  const rect = scene.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;

  pointer.normalizedX = clamp((localX / rect.width) * 2 - 1, -1, 1);
  pointer.normalizedY = clamp((localY / rect.height) * 2 - 1, -1, 1);

  const performanceEnabled = SITE.performance?.enabled === true;
  const parallaxMultiplier =
    performanceEnabled && SITE.performance?.reduceParallax === true
      ? SITE.performance?.reducedParallaxMultiplier ?? 0.35
      : 1;

  pointer.targetParallaxX =
    pointer.normalizedX * SITE.interaction.mouseParallaxX * parallaxMultiplier;
  pointer.targetParallaxY =
    pointer.normalizedY * SITE.interaction.mouseParallaxY * parallaxMultiplier;
}

function resetPointerParallax() {
  pointer.normalizedX = 0;
  pointer.normalizedY = 0;
  pointer.targetParallaxX = 0;
  pointer.targetParallaxY = 0;
}

function updatePointerParallax() {
  const lerpAmount = reducedMotion ? 1 : 0.08;
  pointer.parallaxX = lerp(pointer.parallaxX, pointer.targetParallaxX, lerpAmount);
  pointer.parallaxY = lerp(pointer.parallaxY, pointer.targetParallaxY, lerpAmount);
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    clearSelection();
  }

  if (event.key === "ArrowLeft" && !isTypingTarget(event.target)) {
    navigateBy(-1);
  }

  if (event.key === "ArrowRight" && !isTypingTarget(event.target)) {
    navigateBy(1);
  }

  if ((event.key === "+" || event.key === "=") && !isTypingTarget(event.target)) {
    adjustManualZoom(SITE.interaction.manualZoomStep);
  }

  if (event.key === "-" && !isTypingTarget(event.target)) {
    adjustManualZoom(-SITE.interaction.manualZoomStep);
  }

  if (event.key === "0" && !isTypingTarget(event.target)) {
    resetView();
  }
}


function beginDragPan(event) {
  if (!SITE.interaction?.dragPanEnabled) return;
  if (event.button !== 0) return;

  if (
    event.target.closest(".body") ||
    event.target.closest(".info-panel") ||
    event.target.closest("button") ||
    event.target.closest("a")
  ) {
    return;
  }

  dragPan.active = true;
  dragPan.moved = false;
  dragPan.pointerId = event.pointerId;
  dragPan.startClientX = event.clientX;
  dragPan.startClientY = event.clientY;
  dragPan.startPanX = camera.panX;
  dragPan.startPanY = camera.panY;

  scene.classList.add("is-dragging");

  try {
    scene.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is useful, but not required.
  }
}

function continueDragPan(event) {
  if (!dragPan.active || event.pointerId !== dragPan.pointerId) {
    return;
  }

  event.preventDefault();

  const multiplier = SITE.interaction?.dragPanMultiplier ?? 1;
  const deltaX = (event.clientX - dragPan.startClientX) * multiplier;
  const deltaY = (event.clientY - dragPan.startClientY) * multiplier;

  if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
    dragPan.moved = true;
  }

  camera.panX = dragPan.startPanX + deltaX;
  camera.panY = dragPan.startPanY + deltaY;
}

function endDragPan(event) {
  if (!dragPan.active) {
    return;
  }

  if (
    event.pointerId !== undefined &&
    dragPan.pointerId !== null &&
    event.pointerId !== dragPan.pointerId
  ) {
    return;
  }

  dragPan.active = false;
  dragPan.pointerId = null;
  scene.classList.remove("is-dragging");

  try {
    scene.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released.
  }
}

function handleWheelZoom(event) {
  if (!event.ctrlKey && Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY > 0 ? -1 : 1;
  adjustManualZoom(direction * SITE.interaction.manualZoomStep * 0.7);
}

function adjustManualZoom(delta) {
  camera.manualZoom = clamp(
    camera.manualZoom + delta,
    SITE.interaction.manualZoomMin,
    SITE.interaction.manualZoomMax
  );
}

/* ============================================================
   ORBIT MATH
   ============================================================ */

function advanceOrbit(body, deltaMs) {
  if (body.period && body.period > 0) {
    const direction = body.speed < 0 ? -1 : 1;
    body.meanAnomaly += direction * (deltaMs / body.period) * Math.PI * 2;
  } else {
    body.meanAnomaly += body.speed * deltaMs;
  }

  body.angle = body.meanAnomaly;
}

function getOrbitPosition({
  radius,
  meanAnomaly,
  eccentricity,
  orbitRotationDegrees
}) {
  const e = clamp(Math.abs(eccentricity || 0), 0, 0.92);

  if (e === 0) {
    const localX = Math.cos(meanAnomaly) * radius;
    const localY = Math.sin(meanAnomaly) * radius;
    const rotated = rotatePoint({
      x: localX,
      y: localY,
      degrees: orbitRotationDegrees
    });

    return {
      x: rotated.x,
      y: rotated.y,
      unrotatedY: localY
    };
  }

  const eccentricAnomaly = solveKepler(meanAnomaly, e);
  const semiMajorAxis = radius;
  const semiMinorAxis = semiMajorAxis * Math.sqrt(1 - e * e);

  // The parent body is at one focus of the ellipse.
  const localX = semiMajorAxis * (Math.cos(eccentricAnomaly) - e);
  const localY = semiMinorAxis * Math.sin(eccentricAnomaly);

  const rotated = rotatePoint({
    x: localX,
    y: localY,
    degrees: orbitRotationDegrees
  });

  return {
    x: rotated.x,
    y: rotated.y,
    unrotatedY: localY
  };
}

function solveKepler(meanAnomaly, eccentricity) {
  const normalizedMeanAnomaly = normalizeRadians(meanAnomaly);
  let eccentricAnomaly = normalizedMeanAnomaly;

  for (let i = 0; i < 6; i += 1) {
    eccentricAnomaly -=
      (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - normalizedMeanAnomaly) /
      (1 - eccentricity * Math.cos(eccentricAnomaly));
  }

  return eccentricAnomaly;
}

function updateOrbitEllipse({
  ellipse,
  cx,
  cy,
  radius,
  eccentricity,
  orbitRotation,
  perspective
}) {
  const e = clamp(Math.abs(eccentricity || 0), 0, 0.92);
  const semiMajorAxis = radius;
  const semiMinorAxis = radius * Math.sqrt(1 - e * e);

  // The parent body is at one focus, so the visible ellipse center is offset.
  const focusOffset = semiMajorAxis * e;
  const centerOffset = rotatePoint({
    x: -focusOffset,
    y: 0,
    degrees: orbitRotation || 0
  });

  const ellipseCx = cx + centerOffset.x;
  const ellipseCy = cy + centerOffset.y * perspective;

  ellipse.setAttribute("cx", String(ellipseCx));
  ellipse.setAttribute("cy", String(ellipseCy));
  ellipse.setAttribute("rx", String(semiMajorAxis));
  ellipse.setAttribute("ry", String(semiMinorAxis * perspective));
  ellipse.setAttribute(
    "transform",
    `rotate(${orbitRotation || 0} ${ellipseCx} ${ellipseCy})`
  );
}

function getMaximumOrbitDistance(radius, eccentricity) {
  const e = clamp(Math.abs(eccentricity || 0), 0, 0.92);
  return radius * (1 + e);
}

function rotatePoint({ x, y, degrees }) {
  const radians = degreesToRadians(degrees || 0);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function normalizeRadians(radians) {
  const fullTurn = Math.PI * 2;
  return ((radians % fullTurn) + fullTurn) % fullTurn;
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

  const usableWidth = Math.max(1, metrics.width - SITE.scene.padding * 2);
  const usableHeight = Math.max(1, metrics.height - SITE.scene.padding * 2);

  const fitByWidth = usableWidth / (maximumExtent * 2);
  const fitByHeight =
    usableHeight /
    (maximumExtent * SITE.scene.perspective * 2 + (SITE.center?.size || 150));

  const rawScale = Math.min(1, fitByWidth, fitByHeight);
  return Math.max(SITE.scene.minResponsiveScale, rawScale);
}

function calculateMaximumLogicalExtent() {
  let maxExtent = (SITE.center?.size || 150) / 2;

  rootDefinitions.forEach(definition => {
    const definitionExtent =
      getMaximumOrbitDistance(definition.orbitRadius, definition.orbitEccentricity) +
      calculateDefinitionVisualExtent(definition);

    maxExtent = Math.max(maxExtent, definitionExtent);
  });

  return maxExtent;
}

function calculateDefinitionVisualExtent(definition) {
  const ownExtent = (definition.size || 0) / 2;

  const childExtent = definition.children.reduce((largest, child) => {
    const extent =
      getMaximumOrbitDistance(child.orbitRadius, child.orbitEccentricity) +
      calculateDefinitionVisualExtent(child);

    return Math.max(largest, extent);
  }, 0);

  return Math.max(ownExtent, childExtent);
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

function worldToScreen(x, y) {
  return {
    x: x * camera.scale + camera.renderedX,
    y: y * camera.scale + camera.renderedY
  };
}

/* ============================================================
   INFO / LINK HELPERS
   ============================================================ */

function convertSiteInfo(info) {
  return {
    title: info?.title || "",
    paragraphs: Array.isArray(info?.text) ? info.text.filter(Boolean) : [],
    links: Array.isArray(info?.links) ? info.links.filter(Boolean) : []
  };
}

function normalizeInfo(info) {
  return {
    title: info?.title || "",
    paragraphs: Array.isArray(info?.paragraphs) ? info.paragraphs.filter(Boolean) : [],
    links: Array.isArray(info?.links) ? info.links.filter(Boolean) : []
  };
}

function hasDisplayableInfo(info) {
  return Boolean(
    info.title ||
    info.paragraphs.length ||
    info.links.length
  );
}

function getBodyDisplayName(body) {
  return body.navName || body.info.title || body.alt || body.kindLabel || "Orbital object";
}

function sanitizeLink(link) {
  const label = String(link?.label || "").trim();
  const href = String(link?.href || "").trim();

  if (!label || !href) {
    return null;
  }

  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    href.startsWith("mailto:")
  ) {
    return { label, href };
  }

  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { label, href };
    }
  } catch {
    return null;
  }

  return null;
}

function isExternalHttpLink(href) {
  return href.startsWith("http://") || href.startsWith("https://");
}

/* ============================================================
   TINY UTILITIES
   ============================================================ */

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapIndex(value, length) {
  return ((value % length) + length) % length;
}

function isTypingTarget(target) {
  return target instanceof HTMLElement &&
    (target.matches("input, textarea, select") || target.isContentEditable);
}
