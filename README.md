# Penguin Prototypes Orbital Placeholder — Interactive Edition

This version includes:

- Mouse-responsive parallax drift
- Hover enlargement for all planets / moons / ring objects
- Click-to-focus camera zoom
- Automatically positioned info textbox beside the selected object
- Textbox links rendered as buttons
- Manual zoom in / zoom out / reset buttons
- Mouse wheel zoom over the scene
- Left/right navigator bar cycling through all visible planets, moons, and ring objects
- Load-in animation: objects drop into place in randomized order; the navigator, center, and title/footer finish last
- Keyboard navigation:
  - Left / Right arrows: previous / next object
  - `+` / `-`: zoom in / out
  - `0`: reset
  - `Esc`: close textbox / deselect
- Very easy main-page replacement through `src/site-config.js`
- Very easy planet / moon / textbox editing through `.orbit` files

---

## Updating an existing GitHub Pages repo

Replace the files in your existing repo with the contents of this project, commit, and push.  
The existing GitHub Actions Pages deployment file is already included.

---

## Run locally

```bash
npm install
npm run dev
```

---

# The two places you edit most often

## 1. Main site / hero / background

Edit:

```txt
src/site-config.js
```

This controls:

- Browser tab title
- Large site title
- Subtitle
- Footer
- Background image
- Background color/glows
- Center logo/image
- Mouse parallax strength
- Hover scale
- Selection zoom amount

### Replace the background

1. Put your file in:
   ```txt
   public/images/
   ```
2. Set:
   ```js
   background: {
     image: "/images/your-background.webp"
   }
   ```

### Replace the center image

```js
center: {
  image: "/images/your-center-image.png",
  size: 150
}
```

---

## 2. Planets, moons, rings, textboxes, links

Create or edit:

```txt
src/orbits/*.orbit
```

Every `.orbit` file becomes one top-level orbital system.

---

# Example planet file

```txt
planet: /images/planet.png
title: A Project Planet
nav-name: Project Planet
text: This becomes the first paragraph in its textbox.
text: A second text line becomes a second paragraph.
link: Visit project | https://example.com
alt: Project planet image
size: 80
orbit-radius: 300
orbit-speed: 0.00008
start-angle: 0.4
orbit-line: true
```

---

# Single moon

```txt
moon: /images/moon.png
moon-title: Moon Title
moon-nav-name: Moon Title
moon-text: This appears inside the moon's textbox.
moon-link: Visit moon page | https://example.com
moon-alt: Moon image
moon-size: 22
moon-radius: 55
moon-speed: 0.0005
```

---

# Multi-object ring

```txt
ring-radius: 70
ring-speed: 0.0007
ring-size: 18

ring-image: /images/a.png
ring-title: Object A
ring-nav-name: Object A
ring-text: This text belongs to Object A.
ring-link: Open A | https://example.com/a

ring-image: /images/b.png
ring-title: Object B
ring-nav-name: Object B
ring-text: This text belongs to Object B.
```

Rule:

- A ring with **1 image** functions like a moon.
- A ring with **2 or more images** becomes a shared orbit around the parent.
- A `.orbit` file with no `planet:` line creates an invisible moving anchor whose ring objects still orbit it.

---

# Links

Planet links:

```txt
link: Button Label | https://example.com
```

Moon links:

```txt
moon-link: Button Label | https://example.com
```

Ring-object links:

```txt
ring-link: Button Label | https://example.com
```

---

# Navigator behavior

The bottom left/right bar includes every visible:

- planet
- moon
- multi-ring object
- center object only if you set `interactive: true`

It selects and zooms to the body while opening its textbox.

---

# Deployment

The project includes:

```txt
.github/workflows/deploy.yml
```

Your GitHub Pages source should remain:

```txt
GitHub Actions
```


---

# Intro animation customization

Edit:

```txt
src/site-config.js
```

The section:

```js
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
```

Controls the opening drop-in sequence. Set `enabled: false` to disable it.
