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
    subtitle: ""
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
    image: "/images/pp3.png",
    alt: "Penguin Prototypes center emblem",
    size: 300,
    interactive: true,

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
    manualZoomStep: 0.16,

    // Click-and-drag panning.
    dragPanEnabled: true,
    dragPanMultiplier: 1
  },

  /*
    Performance controls:
    - targetFps: 60 is the default; 30 is available for slower machines.
    - useBackdropBlur: false removes expensive glass blur effects.
    - useMovingDropShadows: false removes animated drop-shadow filters on moving bodies.
    - reduceParallax: true softens mouse-response movement.
    - pauseWhenHidden: true stops animation work when the tab is not visible.
  */
  performance: {
    enabled: true,
    targetFps: 60,
    useBackdropBlur: false,
    useMovingDropShadows: false,
    reduceParallax: false,
    reducedParallaxMultiplier: 0.35,
    pauseWhenHidden: true
  },

  navigator: {
    visible: true,
    selectFirstObjectOnLoad: false,
    overviewLabel: "Whole Solar System",
    centerLabel: "Center"
  },

  /*
    Opening screen fade:
    - The solar system is already in motion behind the black screen.
    - The black screen fades away to reveal the live scene.
    - Set enabled: false to remove the fade entirely.
  */
  intro: {
    enabled: true,
    blackFadeDelayMs: 90,
    blackFadeDurationMs: 1450
  }
};
