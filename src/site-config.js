/*
  ============================================================
  EASY MAIN-SITE CUSTOMIZATION
  ============================================================

  Edit this file when you want to change:
  - The large site title, subtitle, footer, and browser tab title
  - The background image or background colors
  - The central image/logo
  - Scene tilt, mouse response, zoom behavior, and UI defaults

  Planet / moon / ring content lives in:
  src/orbits/*.orbit
*/

export const SITE = {
  browserTitle: "Penguin Prototypes",

  header: {
    title: "Penguin Prototypes",
    subtitle: "Systems in development"
  },

  footer: "penguinprototypes.com",

  /*
    Background image:
    1. Put a PNG / SVG / WebP / JPG into public/images/
    2. Set image to "/images/your-file.webp"
    3. Leave it as "" for the default abstract space background.
  */
  background: {
    image: "",
    imageOpacity: 0.28,
    imageSize: "cover",
    imagePosition: "center center",

    // Used behind the optional image.
    baseColor: "#050912",
    glowA: "rgba(48, 112, 176, 0.18)",
    glowB: "rgba(115, 92, 255, 0.08)",
    glowC: "rgba(64, 166, 255, 0.07)"
  },

  /*
    Center image:
    - Replace /images/core.svg with your own image path.
    - Set interactive: true if you want it clickable.
    - Text and links here format the same way as planet textboxes.
  */
  center: {
    image: "/images/core.svg",
    alt: "Penguin Prototypes center emblem",
    size: 150,
    interactive: false,

    info: {
      title: "Penguin Prototypes",
      text: [
        "This center image can be made clickable by setting interactive: true in src/site-config.js."
      ],
      links: [
        // { label: "Example", href: "https://example.com" }
      ]
    }
  },

  scene: {
    perspective: 0.38,
    depthScale: 0.18,
    padding: 64,
    minResponsiveScale: 0.48
  },

  interaction: {
    // Mouse-movement drift.
    mouseParallaxX: 20,
    mouseParallaxY: 13,
    starParallaxMultiplier: 0.38,

    // Motion smoothing.
    cameraLerp: 0.09,

    // Object hover / selected emphasis.
    hoverScale: 1.18,
    selectedScale: 1.30,

    // Camera zoom when selecting an object.
    clickZoomScaleDesktop: 1.55,
    clickZoomScaleMobile: 1.32,

    // Manual zoom controls.
    manualZoomMin: 0.72,
    manualZoomMax: 2.55,
    manualZoomStep: 0.16
  },

  navigator: {
    visible: true,
    selectFirstObjectOnLoad: false
  },

  /*
    Intro animation when the page first loads:
    - Objects drop into place from varied starting positions.
    - The navigator, center image, and page text finish last.
    - Set enabled: false to disable it.
  */
  intro: {
    enabled: true,
    objectDropDurationMs: 920,
    objectDropStaggerMs: 52,
    objectRandomDelayMs: 260,
    objectStartSpreadX: 540,
    objectStartSpreadY: 430,
    objectStartRotationDeg: 24,

    centerDelayMs: 760,
    chromeDelayMs: 1040,
    chromeDurationMs: 720
  }
};
