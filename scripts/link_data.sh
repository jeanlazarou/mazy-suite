#!/usr/bin/env bash
# Points the web apps at a set of albums: the demo album that ships in
# examples/, or your own collection.
#
# Every app reads its albums from <app>/public/data/ and its audio from
# <app>/public/music/files/. This script makes both of them symlinks and
# rewrites them on demand -- nothing is ever moved or copied, so switching
# back and forth cannot lose anything.
#
#   scripts/link_data.sh                    what each app currently points at
#   scripts/link_data.sh demo               the demo album, from examples/
#   scripts/link_data.sh library            your own collection
#   scripts/link_data.sh library player     one app (or any subset)
#   scripts/link_data.sh unlink             remove the links again
#
# Your collection is found the way song_finder finds it: $MAZY_DATA_DIR and
# $MAZY_MUSIC_DIR, else ~/.config/mazy/song_finder.json, else <repo>/data and
# ~/Music/projects.
#
# Only music/files is linked. An app reading some other music subtree
# (gig_anim's /music/live/files/, player_editor's Metronome.ogg) keeps it as a
# real file next to the link; both modes leave those alone.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
ALL_APPS="player player_editor live_prompter gig_anim lyrics-cards sequence-builder"

# What each app serves. Apps absent from this list need neither.
app_needs() {
  case $1 in
    player | player_editor | live_prompter | gig_anim) echo "data music" ;;
    lyrics-cards) echo "data" ;;
    sequence-builder) echo "music" ;;
    *) return 1 ;;
  esac
}

# Where each kind is served from, under <app>/public/.
link_path() {
  case $2 in
    data) echo "$ROOT/$1/public/data" ;;
    music) echo "$ROOT/$1/public/music/files" ;;
  esac
}

die() {
  echo "link_data: $*" >&2
  exit 1
}

usage() {
  # the header comment above, down to the first line of code
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
  exit "${1:-0}"
}

# --- where your own collection lives ------------------------------------

expand_tilde() {
  case $1 in
    "~") echo "$HOME" ;;
    "~/"*) echo "$HOME/${1#\~/}" ;;
    *) echo "$1" ;;
  esac
}

# Reads one "key": "value" pair out of a flat JSON file. Enough for the two
# fields song_finder's config holds; no jq needed.
json_field() {
  [ -f "$1" ] || return 0
  sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -1
}

CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/mazy/song_finder.json"
DATA_DIR=$(expand_tilde "${MAZY_DATA_DIR:-$(json_field "$CONFIG" data_dir)}")
MUSIC_DIR=$(expand_tilde "${MAZY_MUSIC_DIR:-$(json_field "$CONFIG" music_dir)}")
DATA_DIR=${DATA_DIR:-$ROOT/data}
MUSIC_DIR=${MUSIC_DIR:-$HOME/Music/projects}
DATA_DIR=${DATA_DIR%/}
MUSIC_DIR=${MUSIC_DIR%/}

# --- link targets -------------------------------------------------------

# Path of $1 seen from directory $2, so links inside the repo stay relative
# and survive the repo being moved or cloned elsewhere.
relpath() {
  local target=$1 base=$2 up=""
  while [ "$target" != "$base" ] && [ "${target#"$base"/}" = "$target" ]; do
    base=$(dirname "$base")
    up="../$up"
    [ "$base" = "/" ] && break
  done
  if [ "$target" = "$base" ]; then
    echo "${up%/}"
  else
    echo "$up${target#"$base"/}"
  fi
}

# The text to write in the link: relative when the target is in the repo,
# absolute when it is your collection somewhere else on the disk.
link_text() {
  local target=$1 from=$2
  case $target in
    "$ROOT"/*) relpath "$target" "$from" ;;
    *) echo "$target" ;;
  esac
}

target_for() {
  case "$1:$2" in
    demo:data) echo "$ROOT/examples/data" ;;
    demo:music) echo "$ROOT/examples/music/files" ;;
    library:data) echo "$DATA_DIR" ;;
    library:music) echo "$MUSIC_DIR" ;;
  esac
}

# --- commands -----------------------------------------------------------

# Mode name of an existing link, by comparing what it holds with what each
# mode would write there.
mode_of() {
  local link=$1 kind=$2 dir mode text
  dir=$(dirname "$link")
  text=$(readlink "$link")
  text=${text%/}
  for mode in demo library; do
    [ "$text" = "$(link_text "$(target_for "$mode" "$kind")" "$dir")" ] && {
      echo "$mode"
      return
    }
  done
  echo "other"
}

status() {
  local app kind link state target
  printf 'data  %s\n' "$DATA_DIR"
  printf 'music %s\n\n' "$MUSIC_DIR"
  printf '%-17s %-6s %-8s %s\n' app serves mode 'points at'
  for app in "$@"; do
    [ -d "$ROOT/$app" ] || continue
    for kind in $(app_needs "$app"); do
      link=$(link_path "$app" "$kind")
      target=''
      if [ -L "$link" ]; then
        state=$(mode_of "$link" "$kind")
        target=$(readlink "$link")
        [ -e "$link" ] || state="$state (broken)"
      elif [ -d "$link" ]; then
        state='copy'
        target='a real directory, not a link'
      else
        state='-'
      fi
      printf '%-17s %-6s %-8s %s\n' "$app" "$kind" "$state" "$target"
    done
  done
}

set_link() {
  local link=$1 target=$2 text
  if [ -e "$link" ] && [ ! -L "$link" ]; then
    echo "  skipped ${link#"$ROOT"/} -- a real directory is in the way, move it aside first:" >&2
    echo "    mv '$link' '$link.copy'" >&2
    return 1
  fi
  text=$(link_text "$target" "$(dirname "$link")")
  mkdir -p "$(dirname "$link")"
  ln -sfn "$text" "$link"
  printf '  %-40s -> %s\n' "${link#"$ROOT"/}" "$text"
  [ -e "$link" ] || echo "  warning: $target does not exist" >&2
}

link_apps() {
  local mode=$1 app kind failed=0
  shift
  for app in "$@"; do
    [ -d "$ROOT/$app" ] || {
      echo "  skipped $app -- not in this checkout"
      continue
    }
    for kind in $(app_needs "$app"); do
      set_link "$(link_path "$app" "$kind")" "$(target_for "$mode" "$kind")" || failed=1
    done
  done
  return $failed
}

unlink_apps() {
  local app kind link
  for app in "$@"; do
    for kind in $(app_needs "$app" 2>/dev/null); do
      link=$(link_path "$app" "$kind")
      # Only ever removes a link. A directory someone filled by hand stays.
      [ -L "$link" ] || continue
      rm "$link"
      echo "  removed ${link#"$ROOT"/}"
    done
  done
}

# --- main ---------------------------------------------------------------

command=${1:-status}
[ $# -gt 0 ] && shift

case $command in
  -h | --help | help) usage ;;
  status | demo | library | unlink) ;;
  *) die "unknown command '$command' (try --help)" ;;
esac

apps=${*:-all}
[ "$apps" = "all" ] && apps=$ALL_APPS
for app in $apps; do
  app_needs "$app" >/dev/null || die "unknown app '$app' (one of: $ALL_APPS)"
done

case $command in
  status) status $apps ;;
  demo)
    echo "pointing at the demo album in examples/:"
    link_apps demo $apps
    ;;
  library)
    echo "pointing at your collection ($DATA_DIR, $MUSIC_DIR):"
    link_apps library $apps
    ;;
  unlink) unlink_apps $apps ;;
esac
