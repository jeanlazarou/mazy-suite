## Features

- [x] progress bar
- [x] reorder songs
- [x] show current + progress only
- [x] tour/guide
- [x] use cache storage
- [x] description markdown (links open in a new window)
  - [x] include optional timeline of compositions
  - [x] selectable rendering theme (`$THEME:name`)
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

## Description themes

Without a theme the description is rendered plainly, as it always was. A
description file can pick a different rendering by putting a `$THEME:name` line
anywhere in the file (usually the first line):

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

| Theme     | Looks like                                                                                   |
| --------- | -------------------------------------------------------------------------------------------- |
| `default` | no theme: the plain rendering, styled only by the app's dark mode and your own `<style>` block |
| `sleeve`  | a record sleeve — warm paper, serif type, framed cover, numbered track list                    |
| `liner`   | printed liner notes — small dense type, cover floated to the right, two columns on wide screens |
| `minimal` | quiet typography — plenty of white space, hairline rules, muted metadata                       |
| `neon`    | always dark — purple/cyan glow, monospace track numbers, magenta links                         |

Every theme except `neon` follows the app's dark mode; `neon` is dark in both.
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
