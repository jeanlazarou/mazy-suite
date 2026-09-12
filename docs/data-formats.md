# Mazy Suite data formats

All the tools work off the same shared data folder using plain files: JSON for
structure, SRT for lyrics, Markdown for album descriptions, images for covers.
A complete working example — a real three-track album — ships in
[`examples/`](../examples/):

```
examples/
├── data/                        # → linked as <app>/public/data/
│   ├── albums.json              # list of available albums
│   ├── albums_cache.json        # per-track metadata cache
│   ├── back-to-normal.json      # one album (playlist) definition
│   ├── back-to-normal.md        # album description (Markdown)
│   ├── back-to-normal.png       # album cover, ~250×250
│   ├── back-to-normal-500.png   # album cover, 500×500
│   └── lyrics/
│       └── <Track Title>.srt    # one SRT file per track
└── music/
    └── files/                   # → linked as <app>/public/music/files/
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

Regular Markdown, rendered by the player next to the cover, with substitution
markers that pull data from the playlist:

- a line containing `$T:<track title>` names a track (the marker is removed,
  the title must match a playlist `title`; escape a literal `*` as `\*`)
- on the lines that follow, `$A` expands to that track's `authors`, `$C` to its
  `creationDate`, and `$AC` to `authors - creationDate`

```markdown
1. $T:Big Three

   - $AC
```

A `$THEME:<name>` line anywhere in the file picks how the player renders the
description — `default`, `sleeve`, `liner`, `minimal` or `neon`. The player's
own README documents what each one looks like.

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

## `lyrics.md` — the master lyrics document

Everything above describes a *recorded* album: audio, timings, covers. Songs
exist before that, and some never get past it — so the words also live in a
single hand-written file at the suite root: every lyric of every album, as
written rather than as sung, without the repeats. For an album with no SRT
files it is the only place the words exist at all.

It is not Markdown, despite the name, and must not be rendered as such. Only
`# `, `## ` and the `====` separators carry structure; everything else is text
shown exactly as typed — an indented lyric is not a code block, and `_words_`
are not emphasis.

```
=============================================

# Letter to Nowhere

## Paper Boats (2012-04-15) by Alex Rowe, Jean Lazarou
https://www.kompoz.com/music/collaboration/1234
Original Rowing Song

Everything I meant to keep
went out on paper boats
```

(invented, like the parser's test fixtures — the real file is personal data)

| Line | Means |
|---|---|
| `# <album>` | an album |
| `## <title> (<date>) by <authors>` | a song; a trailing `*` on the title marks a variant |
| a kompoz URL | the collaboration the song came from |
| `Original <title>` | the title the music's composer gave the instrumental |
| `Lyrics from "<title>" (<date>) in "<album>"` | words carried over from an earlier song of your own |
| `"<title>" by <artist> / <year>` | words reused from another band's song |
| anything else | the lyrics |

Only the structure is fixed; the rest is forgiving by design, because the file
it was built for was typed by hand over fifteen years. The credit is written
five different ways, dates range from `2012-04-15` to `June 2010` to
`2014-**-**` when only the year was remembered, and metadata lines come in any
order. [lyrics_book](../lyrics_book/) reads all of it and documents the full
grammar in its README; its `pnpm report` lists what a human should look at —
missing dates, missing authors, titles used twice.

[`examples/lyrics.md`](../examples/lyrics.md) is a working sample: the twelve
songs of the demo album, as written.

## Tool-specific formats

- **gig_anim** performance definitions: see [gig_anim/README.md](../gig_anim/README.md)
- **track_mixer** mix documents: see [track_mixer/SPECIFICATION.md](../track_mixer/SPECIFICATION.md)

## Trying it out

[`scripts/link_data.sh`](../scripts/link_data.sh) points every web app at a set
of albums by symlinking `<app>/public/data` and `<app>/public/music/files`:

```bash
./scripts/link_data.sh demo          # the album in examples/
./scripts/link_data.sh library       # your own collection
./scripts/link_data.sh               # what each app points at right now
./scripts/link_data.sh unlink        # remove the links again

cd player && pnpm install && pnpm dev
```

Your collection is found through `$MAZY_DATA_DIR` / `$MAZY_MUSIC_DIR`, else
`~/.config/mazy/song_finder.json`, else the repo's own `data/` and
`~/Music/projects` — the same lookup [song_finder](../song_finder/) uses. Any
other layout works too, as long as the two folders hold what is described
above; the links are gitignored either way, so your music never ends up in a
commit.
