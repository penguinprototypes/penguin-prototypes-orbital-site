# Penguin Prototypes Orbital Placeholder

## Run it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints.

## Add a new planet

Create a new file in:

```txt
src/orbits/
```

Example:

```txt
planet: /images/my-planet.png
size: 80
orbit-radius: 300
orbit-speed: 0.00008
start-angle: 0.4

moon: /images/my-moon.png
moon-size: 22
moon-radius: 55
moon-speed: 0.0005
```

Place your images in:

```txt
public/images/
```

## Rules

- A `.orbit` file creates one top-level orbital system.
- `planet:` is optional.
- If `planet:` is omitted, the file creates an invisible moving anchor.
- `moon:` creates a one-object ring.
- Repeated `ring-image:` lines create a multi-object ring.
- A ring with one image behaves like a moon.
- A ring with 2+ images becomes a shared orbit around the parent.


## Deploy to GitHub Pages with a custom domain

This project includes:

- `vite.config.js` with `base: "/"` for a custom root domain
- `.github/workflows/deploy.yml` to build and deploy automatically through GitHub Actions

After uploading the project to a new GitHub repository:

1. Go to the repository's **Settings → Pages**
2. Under **Build and deployment → Source**, choose **GitHub Actions**
3. Wait for the workflow under the **Actions** tab to finish successfully
4. In **Settings → Pages → Custom domain**, enter `penguinprototypes.com`
5. Configure DNS at your DNS provider as described in GitHub's custom domain docs
