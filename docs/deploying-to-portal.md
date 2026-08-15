# Deploying an app to the portal site

The portal at <https://jeanlazarou.github.io/mazy-suite/> is a static site
assembled by [`scripts/build_site.sh`](../scripts/build_site.sh) and deployed
by [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) on every
push to `main`. It bundles the portal launcher page plus one built copy of
each app listed in the `APPS` env var, under `/<app-name>/`.

Every app already has a card on the portal page (`portal/index.html`) and is
listed in `ALL_WEB_APPS` in `build_site.sh` — that part was done once, for all
apps, up front. **Deploying an app means adding its name to `APPS`** in the
workflow, which only works once the app can actually run from a subpath
instead of the domain root. That's the part that needs per-app checking.

This was done for `player`, `massembler`, `mix-mastering` and (below) surveyed
for the rest. Use this doc to bring the remaining ones online.

## Why a subpath breaks apps that weren't built for it

Locally, an app runs at `http://localhost:5173/` — the root. On the portal
it runs at `https://jeanlazarou.github.io/mazy-suite/<app-name>/` — one or two
path segments deep. Anything in the app that assumes "root" breaks:

1. **Vite's own asset URLs.** Vite's default `base` is `/`, so built
   `index.html` references assets as `/assets/index-xyz.js`. Under the portal
   prefix the browser requests that from the *domain* root
   (`https://jeanlazarou.github.io/assets/...`), not the site
   (`.../mazy-suite/<app>/assets/...`) — 404, blank page.
2. **The shared demo data.** `build_site.sh` copies `examples/data` and
   `examples/music` to `_site/data` and `_site/music` — siblings of each app
   folder, not children. An app that fetches `/data/albums.json` (absolute)
   hits the domain root and misses; it needs `../data/albums.json` (the app
   folder is one level under the site root, so one `..` reaches it).
3. **Any other absolute-root reference** — `fetch('/something')`,
   `new URL('/something', ...)`, a service worker registration, worker
   scripts that construct their own asset URLs (mix-mastering's WASM worker
   was exactly this case — see `web/src/wasm/engine.ts` in that project for
   the fix: resolve the asset base from `import.meta.env.BASE_URL` and pass
   it into the worker explicitly).

None of this is Pages-specific — the same app would break the same way under
any subpath deployment (a reverse proxy, a different domain layout, etc.).

## Procedure

### 1. Audit the app for absolute-path assumptions

```bash
# Vite base — must be relative
grep -n "base" <app>/vite.config.ts

# absolute-root fetches, worker construction, service workers
grep -rEn "fetch\(['\"]/|new URL\(['\"]?/[^.]|serviceWorker|new Worker\(" <app>/src

# the entry HTML and anything in public/ — Vite does NOT rewrite absolute
# hrefs in index.html, and these live outside src/
grep -n '\(src\|href\)="/' <app>/index.html
ls <app>/public 2>/dev/null
```

The `index.html` check matters more than it looks. massembler shipped
`<link rel="icon" href="/vite.svg">` — absolute, so under the portal it
requested `jeanlazarou.github.io/vite.svg`, and the file did not exist in that
app at all. `base: './'` does not save you here: Vite rewrites asset
references it resolves, not arbitrary absolute URLs you wrote by hand. A
`src/`-only grep misses it entirely.

Fix what you find:

- **`vite.config.ts`**: set `base: './'`.
- **Shared demo data fetches**: point them at a relative path instead of an
  absolute one. `player/src/api.js` has the reference pattern —
  `export const DATA = <flag> ? "./data" : "../data"`, switched by a feature
  flag for the case where the app is also run standalone (not under the
  portal's `<site>/<app>/` layout). Reuse that pattern rather than
  inventing a new one.
- **Anything else absolute-root**: make it relative, or resolve it at
  runtime from `import.meta.env.BASE_URL` (see mix-mastering's WASM worker
  bridge for a worked example of the latter, needed because a Web Worker
  can't use Vite's `base` directly).
- **An absolute reference to an asset that does not exist**: delete it rather
  than making it relative. massembler's favicon pointed at a `vite.svg` the
  app had never had — no `public/` folder at all — so it had been 404ing
  locally too, unnoticed. It was replaced with an inline `data:` SVG, which
  needs no file and no path.

Don't assume a hit is a real problem without reading it — e.g. an endpoint
like `/__suite/list` may be a dev-only local API middleware that isn't part
of the built app at all. Confirm before "fixing" something that doesn't
need it.

### 2. Handle a non-standard build, if the app has one

The generic loop in `build_site.sh` does, for each app in `APPS`:

```bash
(cd "$app" && pnpm install --frozen-lockfile && pnpm build)
# then copies $app/build or $app/dist into the site
```

This works unchanged for any plain Vite app with a `pnpm-lock.yaml` and a
`build` script at its root (i.e. all of them right now, mix-mastering
excepted). If a future app needs something the generic loop can't do — a
compiled backend, a codegen step, output in a different directory — add an
`if [ "$app" = "<name>" ]; then ... continue; fi` branch before the generic
case, following the `mix-mastering` block in `build_site.sh` as the
template. Also add whatever toolchain that needs to
`.github/workflows/pages.yml` (mix-mastering needed `actions/setup-go`) and
its lockfile path to the `cache-dependency-path` list.

### 3. Add the app to `APPS`

In `.github/workflows/pages.yml`, two places — the app list and the pnpm
cache key. The second is easy to forget because omitting it breaks nothing
visibly; it just means the cache is keyed off other apps' lockfiles and goes
stale silently.

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: |
            player/pnpm-lock.yaml
            massembler/pnpm-lock.yaml
            mix-mastering/web/pnpm-lock.yaml
            <app-name>/pnpm-lock.yaml

      - name: Build site
        run: bash scripts/build_site.sh
        env:
          APPS: player massembler mix-mastering <app-name>
```

**Check the app has a `pnpm-workspace.yaml` approving its build scripts.**
pnpm 11 blocks dependency postinstall scripts by default, and esbuild (under
Vite) wants one. Every app deployed so far carries:

```yaml
allowBuilds:
  esbuild: true
```

`gig_anim`, `lyrics-cards` and `live_prompter` have no `pnpm-workspace.yaml`
at all, so watch the CI install step for a blocked-build warning when you get
to them.

### 4. Verify locally before pushing

Don't rely on CI to be the first place this runs — build and drive the real
assembled site yourself:

```bash
cd /path/to/mazy-suite
APPS="player massembler mix-mastering <app-name>" bash scripts/build_site.sh

# no absolute paths may survive into the built entry HTML
grep -o '\(src\|href\)="/[^"]*"' _site/<app-name>/index.html || echo "all relative"

# the portal card must point at the deployed copy, not the repo
grep -o 'href="[^"]*<app-name>[^"]*"' _site/index.html

# serve it under a real-looking prefix, not the repo root
mkdir -p /tmp/sitecheck/mazy-suite
cp -R _site/* /tmp/sitecheck/mazy-suite/
cd /tmp/sitecheck && python3 -m http.server 5300
```

Those two greps are quick and catch the two silent failures. The first is the
mechanical version of step 1's audit — whatever the source looked like, this
is what actually shipped. The second matters because `build_site.sh` rewrites
the card of any app *not* in `APPS` to point at the GitHub source tree, so
`href="./<app-name>/"` is the sign it took; anything else means the app never
made it into `APPS`, or the card's href does not match the exact string the
script rewrites.

Then open `http://localhost:5300/mazy-suite/` in a browser (or drive it
headlessly with Playwright) and actually use the app from there — load its
demo data if it has any, exercise its main feature, and check the browser
console for 404s or errors. A page that merely *renders* isn't proof; a 404'd
JS chunk or a missing data fetch often still shows *something*. This is what
caught the `/data/albums.json` cases below — they'd have shipped broken to
the live portal without a real subpath test.

Clean up `_site/` (gitignored, but no reason to leave it) and stop the test
server when done.

### 5. Commit and push

Commit `build_site.sh`, `pages.yml`, and any app-side fixes together, push to
`main`, and watch the Action run at
`github.com/jeanlazarou/mazy-suite/actions`. The deploy is live within a
minute or two of the workflow finishing.

**Do not treat an HTTP 200 as proof the deploy landed.** The previous build
answers 200 from the same URL, so polling the page tells you nothing about
whether *your* build is being served. Poll for something only the new build
contains — the app's version string is ideal:

```bash
until curl -s https://jeanlazarou.github.io/mazy-suite/<app-name>/ \
  | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 \
  | xargs -I{} curl -s "https://jeanlazarou.github.io/mazy-suite/<app-name>/{}" \
  | grep -q "<expected-version>"; do sleep 10; done
echo "live"
```

This is the argument for showing the version in the app's own UI. massembler
injects `package.json`'s version through Vite's `define` and prints it in the
header, so "is the new build live?" and "which build is this user on?" are
answerable by looking. Without something like that, a stale CDN or service
worker cache is indistinguishable from a successful deploy.

If `gh` is not authenticated in your shell you cannot read the workflow logs
at all — polling the deployed asset is then the only signal you have, so
prefer a check that cannot pass against the old build.

Finally, drive the *live* site once, not just the local copy. Same script as
step 4, pointed at the real URL: the local check proves the assembly, this
proves what GitHub actually serves.

## Current status (as surveyed)

| App | `vite.config.ts` base | Absolute-path hits found | Notes |
|---|---|---|---|
| player | `./` | — | **deployed** |
| massembler | `./` | absolute favicon in `index.html` | **deployed**; the hit was outside `src/`, see step 1 |
| mix-mastering | `./` | — | **deployed** (special-cased Go/WASM build) |
| gig_anim | `./` | none found | base already correct; re-check for demo-data fetches if it uses any |
| lyrics-cards | `./` | `fetch('/data/albums.json')` ×2 in `DataPathHelper.ts` | base already correct; fix the data path per step 1 |
| player_editor | default (`/`) | none found | needs `base: './'` |
| live_prompter | default (`/`) | `fetch('/data/albums.json')` in `App.tsx` | needs both fixes |
| track_mixer | default (`/`) | `fetch('/__suite/list')` in `api.js` | needs base fix; confirm the `/__suite/list` call is dev-only before touching it |
| groove_lab | default (`/`) | none found | needs `base: './'` |
| sequence-builder | default (`/`) | none found | needs `base: './'` |

This table is a snapshot from one grep-based pass, not a guarantee — re-run
the audit commands in step 1 on the actual app before trusting it, and treat
step 4's real-browser check as the thing that actually proves it works.
