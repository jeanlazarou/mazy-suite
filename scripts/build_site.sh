#!/usr/bin/env bash
# Assembles the demo/portal site into _site/:
#   /            portal launcher page
#   /data        demo album data (examples/)
#   /music       demo album audio (examples/)
#   /<app>/      one folder per built web app (APPS)
#
# The site is served under an arbitrary prefix (e.g. GitHub Pages'
# /mazy-suite/), so demo track URLs are rewritten to be relative to the
# app pages. Portal cards of apps not in APPS point at the repository.
#
# Usage: scripts/build_site.sh            # builds APPS="player"
#        APPS="player lyrics-cards" scripts/build_site.sh
set -euo pipefail
cd "$(dirname "$0")/.."

APPS=${APPS:-player}
ALL_WEB_APPS="player player_editor live_prompter gig_anim track_mixer groove_lab massembler sequence-builder lyrics-cards mix-mastering"
REPO_URL="https://github.com/jeanlazarou/mazy-suite"
SITE=_site

rm -rf "$SITE"
mkdir -p "$SITE"

cp portal/index.html "$SITE/index.html"
cp -R examples/data "$SITE/data"
cp -R examples/music "$SITE/music"

# absolute /music/files/... URLs (track urls and cache keys/ids) would
# escape the site prefix; app pages live one level deep, so ../music works
for f in "$SITE"/data/*.json; do
  sed -i.bak 's|"/music/files/|"../music/files/|g' "$f"
done

for app in $APPS; do
  echo "=== building $app"
  (cd "$app" && pnpm install --frozen-lockfile && pnpm build)
  if [ -d "$app/build" ]; then
    cp -R "$app/build" "$SITE/$app"
  else
    cp -R "$app/dist" "$SITE/$app"
  fi
done

# cards of apps not deployed on this site link to their source instead
for app in $ALL_WEB_APPS; do
  case " $APPS " in
    *" $app "*) ;;
    *) sed -i.bak "s|href=\"./$app/\"|href=\"$REPO_URL/tree/main/$app\"|" "$SITE/index.html" ;;
  esac
done

find "$SITE" -name '*.bak' -delete
echo "=== site assembled in $SITE/ ($(du -sh "$SITE" | cut -f1))"
