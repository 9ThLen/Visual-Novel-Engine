# Web Deployment

This project exports the web app through Expo and deploys it with GitHub Actions.

## Prerequisites

- Node.js 18+
- pnpm 9+
- GitHub repository with Pages enabled

## Local Web Development

```bash
pnpm install
pnpm dev:web
```

## Web Export

Use the repository script:

```bash
bash scripts/build-web.sh
```

The web output is written to `dist/`. The app config uses Metro with single-file web output:

```js
web: {
  bundler: "metro",
  output: "single",
  favicon: "./assets/images/favicon.png",
}
```

## GitHub Pages

The workflow lives at `.github/workflows/deploy-web.yml`.

1. Open repository settings on GitHub.
2. Enable GitHub Pages.
3. Set the source to GitHub Actions.
4. Push to the branch used by the workflow.
5. Check the Actions tab for the deploy result.

## Troubleshooting

- If dependencies are missing locally, run `pnpm install`.
- If `dist/` is stale, delete it and re-run `bash scripts/build-web.sh`.
- If assets do not load, check `app.config.js` and bundled asset paths.
- If GitHub Pages shows an old build, rerun the workflow from the Actions tab.
