# Credits page drop-in folder

Copy this folder to:

```text
public/credits/
```

After deployment, the page will be available at:

```text
/credits/
```

## How the data works

This version uses one central category index:

```text
public/credits/data/categories.json
```

Each category lists the `.credit` files it should load. There are **no per-folder manifest.json files**.

Static sites cannot automatically ask GitHub Pages/Vite for "all files in this folder", so `categories.json` is still needed as the one central file list.

## Add a new category cylinder

1. Create a folder in `public/credits/data/`, for example:

```text
public/credits/data/music/
```

2. Add the category to `public/credits/data/categories.json`:

```json
{
  "id": "music",
  "name": "Music",
  "folder": "music",
  "files": [
    "Example Song.credit"
  ]
}
```

3. Add the `.credit` file named in the `files` list.

## Add a new entry

Create a `.credit` file inside the category folder:

```text
public/credits/data/inspirations/Factorio.credit
```

Then add it to the matching category's `files` array in `categories.json`.

## .credit format

The format is intentionally similar to the site's `.orbit` files: one key-value pair per line.

```text
name: Factorio
type: Inspiration
short: Short one-sentence summary.
description: Main description shown in the top half of the credits page.
section: Section Title | Section body text.
section: Another Section | More section text.
link: Link label | https://example.com/
```

Supported keys:

```text
name: Display name
type: Contributor, Inspiration, Artist, Tool, etc.
short: Short summary line
description: Main paragraph
section: Title | Body
link: Label | URL
slug: optional-custom-url-slug
```

Blank lines and lines beginning with `#` are ignored.

## Controls

- Scroll over the bottom cylinder to rotate names.
- Hover a name to light up that segment.
- Click a name to load its details in the top half.
- Use left/right arrows or the category buttons to switch cylinders.
- Use up/down arrows to rotate the current cylinder.

## Linking from the main orbital page

Link to this page with:

```html
<a href="/credits/">View full credits</a>
```

An optional example orbit file is included in:

```text
optional-src-orbits/credits.orbit
```

Copy it to your repo's `src/orbits/` folder and update the planet image path.
