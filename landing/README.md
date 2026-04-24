# folk landing page

Public marketing page for folk. Standalone static site — no build step.

## Run locally

From the repo root:

    python3 -m http.server 8000

Then open http://localhost:8000/landing/

## Deploy

Static-host friendly. Push the `landing/` folder to GitHub Pages, Vercel, Netlify, or any static host. Make sure `../styles.css` (relative import in `landing.css`) is served from the parent directory — copy it alongside or vendor it inline before deploying to a host that doesn't include the parent.

## Recapture screenshots

Run the prototype `index.html` at the repo root, navigate to each page, and capture at 2x resolution. Save to `screenshots/` with the names referenced in `index.html` (`hero-app.png`, `mcp-editor.png`, `model-providers.png`).
