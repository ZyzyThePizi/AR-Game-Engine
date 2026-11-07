# References: deploying ar_game to GitHub Pages (2026-11-07)

**Question:** Can the Angular 14 app in `ar_game/` be hosted at `zyzythepizi.github.io/<name>` so players just open a link, and what is the cleanest way to keep it updated?
**Angles:** functionality (build + deploy flow) · best practices (paths, HTTPS, storage) · other usages (other hosts)

## 1. About GitHub Pages: official docs: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages
- A user site lives at `<owner>.github.io`. Each other repo can have one project site at `<owner>.github.io/<repo-name>`.
- Keep: the URL path is the **repo name**, so `AR-Game-Engine` gives `/AR-Game-Engine/`.

## 2. Configuring a publishing source: official docs: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Set Source = "GitHub Actions". The flow is checkout, build, `upload-pages-artifact`, then `deploy-pages`.
- Keep: no `gh-pages` branch and no committed build output.

## 3. GitHub Pages limits: official docs: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- The site can be at most 1 GB. Bandwidth has a soft limit of 100 GB per month. A deploy times out after 10 minutes. Our build is a few MB.

## 4. "Host an Angular app on GitHub Pages with GitHub Actions": blog, 2026-09-05: https://macmyths.com/host-an-angular-application-on-github-pages-with-github-actions/
- It builds with `--base-href=/${{ github.event.repository.name }}/` and copies `index.html` to `404.html`. It uses `configure-pages@v5`, `upload-pages-artifact@v4` and `deploy-pages@v4`.
- Avoid: its output path is the Angular 17+ `dist/<app>/browser`. Angular 14 writes straight to `dist/ar_game`.

## 5. angular-cli-ghpages: GitHub, MIT, about 980 stars: https://github.com/angular-schule/angular-cli-ghpages
- `ng deploy` pushes to a `gh-pages` branch and creates `404.html` and `.nojekyll`. Version 3 supports Angular 18–22 only, so Angular 14 needs v1 or v2.
- Avoid: an old tool version tied to an old Angular. The official Actions flow does not depend on the Angular version.

## 6. Angular deployment guide: official docs: https://angular.dev/tools/cli/deployment
- Prefer `<base href>` over `--deploy-url`. Routed apps need a fallback to `index.html`, which is what `404.html` does.

## 7. github-pages-local-storage: GitHub (snippet): https://github.com/TomasHubelbauer/github-pages-local-storage
- Every project site under `zyzythepizi.github.io` shares **one origin**, so they share one localStorage.

## 8. MDN getUserMedia: docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- The camera works only on HTTPS or localhost. GitHub Pages serves HTTPS, so this is fine.

## Patterns · Gaps
- Every Angular-on-Pages guide uses the same three steps: set `--base-href /<repo>/`, copy `404.html`, deploy with Actions.
- None of the guides mention the shared localStorage across project sites, or that changing the base href changes where saved data lives.

## Our version
- The workflow is `.github/workflows/deploy-pages.yml`, triggered on push to `main` and by hand. It sets up Node 20, runs `npm ci` and `ng build --base-href /<name>/` in `ar_game/`, and copies `404.html`. It then uploads `ar_game/dist/ar_game` and deploys.
- Name: we chose to keep the repo name, so the site is at `https://zyzythepizi.github.io/AR-Game-Engine/`. Getting `/ar-game/` would have needed a rename, a second repo, or a folder in `ZyzyThePizi.github.io`, and the last two need a cross-repo deploy key.
- The app already uses relative `assets/...` paths and has no router deep links, so no code changes are needed for paths.
- Storage keys (`arGameSettings`, per-game leaderboard keys) are already app-specific. Check them once against the other apps on the user site.
- Offline caveat: the pose model and WASM still load from the jsdelivr and Google CDNs, the same as today.

## Dropped sources
- Netlify and Vercel docs were not opened. They are only mentioned as alternatives.
