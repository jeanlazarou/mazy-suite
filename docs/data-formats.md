# Mazy Suite data formats

All the tools work off the same shared data folder using plain files: JSON for
structure, SRT for lyrics, Markdown for album descriptions, images for covers.
A complete working example — a real three-track album — ships in
[`examples/`](../examples/):

```
examples/
├── data/                        # → copy (or symlink) to <app>/public/data/
│   ├── albums.json              # list of available albums
│   ├── albums_cache.json        # per-track metadata cache
│   ├── back-to-normal.json      # one album (playlist) definition
│   ├── back-to-normal.md        # album description (Markdown)
│   ├── back-to-normal.png       # album cover, ~250×250
│   ├── back-to-normal-500.png   # album cover, 500×500
│   └── lyrics/
│       └── <Track Title>.srt    # one SRT file per track
└── music/                       # → copy (or symlink) to <app>/public/music/
    └── files/
        └── Back to Normal/
            └── <Track Title>.mp3
```

## `albums.json` — the albums list

An array; each entry names an album. The `name` is the base name of the album's
other files (`<name>.json`, `<name>.md`, `<name>.png`…).

```json
[
  { "name": "back-to-normal", "image": "png", "color": "#b0b3c2" }
]
```

| field | | |
|---|---|---|
| `name` | required | base name of the album's files in `data/` |
| `image` | optional | cover file extension, default `"jpg"` |
| `color` | optional | CSS color used to categorize/filter albums in the player |

## `<name>.json` — an album / playlist

```json
{
  "title": "Back to Normal",
  "period": { "from": "2017/06/18", "to": "2020/05/04" },
  "playlist": [
    {
      "url": "/music/files/Back to Normal/Big Three.mp3",
      "volume": "89",
      "title": "Big Three",
      "creationDate": "2017/09/10",
      "authors": ["Jean Lazarou"]
    }
  ]
}
```

| field | | |
|---|---|---|
| `title` | required | album display title |
| `period` | optional | `from`/`to` dates (`YYYY/MM/DD`) covered by the album |
| `playlist[].url` | required | audio path as served by the app (under `public/`) |
| `playlist[].title` | required | track title; also names the SRT file in `data/lyrics/` |
| `playlist[].volume` | optional | playback volume in percent, as a string |
| `playlist[].creationDate` | optional | `YYYY/MM/DD` |
| `playlist[].authors` | optional | list of author names |

A trailing `*` or `+` on a track title marks a variant (e.g. a collaboration);
tools strip it when resolving the lyrics file name.

## `<name>.md` — the album description

Regular Markdown, rendered by the player next to the cover, with two
substitution markers that pull data from the playlist:

- a line containing `$T:<track title>` names a track (the marker is removed,
  the title must match a playlist `title`; escape a literal `*` as `\*`)
- `$AC` on a following line expands to that track's `authors - creationDate`

```markdown
1. $T:Big Three

   - $AC
```

An optional `<style>…</style>` block anywhere in the file is extracted and
applied to the rendered description.

## `lyrics/<Track Title>.srt` — synchronized lyrics

Standard SRT subtitles, one file per track, named exactly after the track
title. The suite's tools (player_editor's parser is the reference) expect
**strict** SRT: sequential numeric ids starting at 1, `from < to` on every
cue, and strictly increasing timings. srt_generator drafts these
automatically; player_editor is where you fine-tune them.

```
1
00:00:12,000 --> 00:00:15,200
First verse line
```

## `albums_cache.json` — the metadata cache

Lets the player start without probing every audio file. Keyed by track `url`;
maintained by **music_cache_updater**.

```json
{
  "/music/files/Back to Normal/Big Three.mp3": {
    "id": "/music/files/Back to Normal/Big Three.mp3",
    "isNew": false,
    "lastModified": "Sun, 19 Jul 2026 12:06:30 GMT",
    "duration": 117.420408
  }
}
```

## Tool-specific formats

- **gig_anim** performance definitions: see [gig_anim/README.md](../gig_anim/README.md)
- **track_mixer** mix documents: see [track_mixer/SPECIFICATION.md](../track_mixer/SPECIFICATION.md)

## Trying it out

From a web app's folder (e.g. `player/`):

```bash
cp -r ../examples/data public/data
cp -r ../examples/music public/music
pnpm install && pnpm dev
```

Then replace the demo files with your own library, keeping the same layout —
`public/data` and `public/music` are gitignored, so your music never ends up
in a commit.
