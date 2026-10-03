## Features

- [x] progress bar
- [x] reorder songs
- [x] show current + progress only
- [x] tour/guide
- [x] use cache storage
- [x] description markdown (links open in a new window)
  - [x] include optional timeline of compositions
  - [x] selectable rendering theme (`$THEME:name`)
  - [x] per-song origin: rework/remix/AI, and when the original was written
- [x] save playlist
- [x] save to clipboard
- [x] show song loading
- [x] loop list, loop current track
- [x] small/large cards for songs
- [x] select type of sort: shuffle, current manual approach, drag and drop
- [x] re-order view shows initial indexes and future indexes
- [x] store user preferences
- [x] prevent track selection if audio file does not exist
- [x] filter
  - [x] filter/un-filter by clicking tracks
- [x] albums page
  - [x] background colors for album cards
  - [x] view album covers
  - [x] filter albums using color category
  - [x] filter albums using album ratings
  - [x] view album summary, open playlist as new page
  - [x] optionally show more information (album rating and number of tracks)
- [x] snooze feature, play during n minutes and stop (snooze), display timer, turn black after a while
- [x] lyrics subtitles
- [x] features/preferences configuration editor
- [x] create and save playlists on disk
  - [x] filter by albums, stars, titles, authors
- [x] Track cards contain
  - recorded data
  - last modification date (highlighting recent and updated tracks)
- [x] disable track, store state
  - blur track titles when disabled
  
Load another playlist: http://localhost:3000/?list=small-files.json

## Playlist description file

A _markdown_ (sibling) file to the playlist having the same name (extension `md`) is loaded.

The file can contain some specific things:

- mark the start of a song with `$T:song-title`
- using the current song title
  - every `$A` string is replace with the author list found in the JSON file
  - every `$C` string is replace with the creation date found in the JSON file
  - every `$AC` string is replace with the author list and the creation date found in the JSON file
  - a token before the first `$T:`, or one with no matching song in the JSON file, is replaced with nothing
- say where a song comes from with `$KIND:`, `$FROM:` and `$NOTE:` (see [Where a song comes from](#where-a-song-comes-from))
- pick a rendering theme with a `$THEME:name` line (see [Description themes](#description-themes))
- the content of blocks starting with `<style>` and ending with a matching `</style>` is added as CSS style

The output is set inside a `div` HTML tag with the id `playlist-description`.

The song title is wrapped in `<span class="description-song-title">`, the song
list is an `<ol class="description-list">` and the notes under a song are an
`<ul class="description-sublist">`.

You can add styles like:

```css
#playlist-description img {
  width: 130px;
  border-radius: 50%;
  display: inline;
}

#playlist-description ol {
  margin-left: 130px;
  position: relative;
  top: -150px;
  height: 0px;
}
```

## Where a song comes from

Some songs are not new work: a rework, a remix, a version generated from an
older piece. Three markers, written as ordinary bullets under a song, record
that — what the track is, when the material it is built on was written, and a
free note about it:

```markdown
1. $T:Glass Door*

   - $AC
   - $KIND:AI rework
   - $FROM:1992
   - $NOTE:Rebuilt from my four-track demo, vocals generated with Suno
```

- `$KIND:` — free text, shown as a short label (`AI rework`, `remix`, `cover`…)
- `$FROM:` — when the original was written; a year, a `year/month`, or a full date
- `$NOTE:` — a sentence about it; ordinary markdown, so links work

Write only the ones you have, in any order; a song with none of them renders
exactly as before. `$A`, `$C` and `$AC` are expanded inside the values, so a
note can quote the song's own credits.

The three are collected per song and rendered as **one** element, in place of
the first of them:

```html
<span class="description-origin">
  <span class="description-origin-kind">AI rework</span>
  <span class="description-origin-from">1992</span>
  <span class="description-origin-note">Rebuilt from my four-track demo…</span>
</span>
```

Markers written before the first `$T:` belong to no song and are rendered where
they stand, which is a way to say the same thing about a whole album.

The `default` rendering and the `dossier`, `lineage`, `prism` and `orbit` themes
show this element (`orbit` in the list under its ring, not on the ring itself).
`sleeve`, `liner`, `minimal` and `neon` were designed before it existed and
deliberately leave it out — a theme opts in by overriding the `display: none`
set on `.description-themed .description-origin`.

## Description themes

Without a theme the description gets the plain rendering: no art direction, just
readable spacing and hierarchy, and your own `<style>` block still overrides all
of it. A description file can pick a different rendering by putting a
`$THEME:name` line anywhere in the file (usually the first line):

```markdown
$THEME:sleeve

# Chapter 22

![alt text](chapter-22.jpg "Chapter 22")

_(2026)_

1. $T:Few Years After Me
   - $AC
```

The line itself is removed before the markdown is rendered, the name is not
case sensitive, and an unknown name falls back to `default` (with a warning in
the console). If the file has more than one marker, the first one wins.

| Theme     | Looks like                                                                                     | Shows `$KIND`/`$FROM`/`$NOTE` |
| --------- | ---------------------------------------------------------------------------------------------- | :---------------------------: |
| `default` | no theme: the plain rendering — quiet typography, your own `<style>` block still on top of it   |              yes              |
| `sleeve`  | a record sleeve — warm paper, serif type, framed cover, numbered track list                      |              no               |
| `liner`   | printed liner notes — small dense type, cover floated to the right, two columns on wide screens   |              no               |
| `minimal` | quiet typography — plenty of white space, hairline rules, muted metadata                         |              no               |
| `neon`    | always dark — purple/cyan glow, monospace track numbers, magenta links                           |              no               |
| `dossier` | a case file — manila paper, typewriter type, each origin boxed and stamped with what it is       |              yes              |
| `lineage` | a line of descent — the year the material was written, an arrow, then what the track became      |              yes              |
| `prism`   | one hue per track, spread around the colour wheel — coloured bar, number, badge and origin block |              yes              |
| `orbit`   | the track titles on a ring around a circular cover, with the full list under it                  |              yes              |

and the **gallery** family — one layout, eight colour atmospheres (see below):

| Theme    | Atmosphere                                               |
| -------- | -------------------------------------------------------- |
| `dusk`   | a night sky: deep navy, cool blue glow                    |
| `ember`  | charcoal and warm firelight, amber accents                |
| `garnet` | deep red, close and smouldering                           |
| `ochre`  | old gold, lamplit                                         |
| `moss`   | deep green, damp and quiet                                |
| `plum`   | deep violet, late and electric                            |
| `ivory`  | warm paper, light, plenty of air                          |
| `slate`  | cool light grey, neutral under a loud cover               |

Every theme except `neon`, `orbit` and the gallery family follows the app's dark
mode; those are fixed, because an atmosphere is something you pick for a cover,
not something the time of day should change.

`orbit` shows the numbers and titles on the ring — authors, links and notes
would collide with it — and then repeats the album under the ring as an ordinary
list with everything in it. The copy is made by `DescriptionModal`, which clones
the song list and appends it; the ring rules only match the list that is a direct
child of the description body, so the copy renders as a plain stacked list. The
ring widens with the track count, and below 820px wide the ring is dropped
altogether and the list is shown once.

`prism` and `orbit` position songs by their place in the list, so
`DescriptionModal` puts `--song-index` on every song and `--song-count` on the
list — CSS cannot count siblings. Any theme can use them.

### The gallery family

`dusk`, `ember`, `garnet`, `ochre`, `moss`, `plum`, `ivory` and `slate` are the
same layout in eight colour atmospheres: a centred title and year, the cover
**whole** — at its own
aspect ratio, nothing cropped — and the track list under a hairline rule. Pick
the one that suits the artwork; nothing else changes.

It is `orbit`'s composition without the ring. `orbit` masks the cover into a
circle, which costs a square sleeve its corners, so where that matters use
`dusk`: same night sky, cover intact.

A family is declared in [`src/descriptionThemes.js`](src/descriptionThemes.js):

```js
export const THEME_FAMILIES = {
  gallery: ["dusk", "ember", "garnet", "ochre", "moss", "plum", "ivory", "slate"],
};
```

Members get a `description-family-<name>` class alongside their own, so the
layout is written once against `.description-family-gallery` and each member
declares nothing but its palette. Adding an atmosphere is one entry in that list
plus one block of `--desc-*` values.

Themes are implemented in [`src/DescriptionThemes.css`](src/DescriptionThemes.css)
and listed in [`src/descriptionThemes.js`](src/descriptionThemes.js) — add a
name to that list and a matching `#playlist-description.description-theme-<name>`
block to add one.

A theme only needs to declare its palette; the shared rules do the layout:

```css
#playlist-description.description-theme-mine {
  --desc-bg: #ffffff;      /* panel background */
  --desc-bg-image: none;   /* optional gradient over the background */
  --desc-fg: #4a4a4a;      /* body text */
  --desc-heading: #111111; /* headings and song titles */
  --desc-accent: #b8b8b8;  /* track numbers */
  --desc-muted: #909090;   /* the year line and the notes under a song */
  --desc-rule: rgba(0, 0, 0, 0.08); /* separators */
  --desc-link: #111111;
  --desc-chip: rgba(0, 0, 0, 0.07); /* the $KIND badge, gallery family only */
}
```

Re-declaring the same properties under `.player-modal-dark #playlist-description.description-theme-mine`
gives the theme its dark variant.

A `<style>` block in the description file still wins over the theme (those
blocks use `#playlist-description ...` selectors, which are more specific), so
an album can pick a theme and then tweak it.

## Links

List of file signatures: https://en.wikipedia.org/wiki/List_of_file_signatures

| Signature   | Text | Audio file type                  |
| ----------- | :--: | -------------------------------- |
| 4F 67 67 53 | OggS | Ogg open source media container  |
| FF FB       |  ÿû  | MP3 file without an ID3          |
| 49 44 33    | ID3  | MP3 file with an ID3v2 container |

```
yarn run index src/data/playlist.md
```

Tips for images...

- tech hierarchy
- listeners you do not see them, they can be anywhere
- do you see the business when you look at the code?

## Icons

Albums icon: https://thenounproject.com/term/music-albums/116133/

## Libraries

- Fuse.js: a powerful, lightweight fuzzy-search library, with zero dependencies.
  Link: https://fusejs.io/

- waveform display
  Link: https://github.com/katspaugh/wavesurfer.js

- tour/guide
  Link: https://github.com/elrumordelaluz/reactour
