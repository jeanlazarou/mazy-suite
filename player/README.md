## Features

- [x] progress bar
- [x] reorder songs
- [x] show current + progress only
- [x] tour/guide
- [x] use cache storage
- [x] description markdown (links open in a new window)
  - [x] include optional timeline of compositions
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
- the content of blocks starting with `<style>` and ending with a matching `</style>` is added as CSS style

The output is set inside a `div` HTML tag with the id `playlist-description`.

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
