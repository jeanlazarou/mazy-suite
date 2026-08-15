# song finder

A song in this library has more than one name, and they rarely agree.

A collaboration comes down from kompoz under whatever the starter called it —
*And Chill*. The DAW project is that title plus the collaboration id,
`And Chill (1473518)`. The mix is bounced to `And Chill.mp3`. But once the
vocals and lyrics are on it, the song is called **Asymmetric Love**, and that is
the only name you remember six months later.

song finder indexes every one of those names, plus the authors and the lyrics,
so you can start from whichever one you have and get back to the file. Then it
copies what you found somewhere useful, renamed to the song title.

![Searching "So much" across 467 tracks: the top hit is the song So Much on Couldn't Make, whose mix is still called "It's a long way", and the panel on the right resolves the rest — the full original title "It's a long way from here to there", the kompoz collaboration 1470943, the file on disk, the lyrics, and the name a copy would get: So Much.mp3](docs/screenshots/main-view.svg)

```
$ song-finder search asymmetric

Song              Album           Original file   Authors
Asymmetric Love   Couldn't Make   And Chill       Mikael Lindh, Jean Lazarou  ♪
```

And the other direction — an mp3 you can't place:

```
$ song-finder identify "And Chill.mp3"

Asymmetric Love
  album      Couldn't Make
  original   And Chill
  authors    Mikael Lindh, Jean Lazarou
  created    2025/07/30
  kompoz     https://www.kompoz.com/studio/collaboration/1473518
  file       /Users/lab/Music/projects/Couldn't Make/And Chill.mp3
```

## Install

```bash
cd song_finder
poetry install
```

That puts the `song-finder` command *inside the project's virtualenv*, not on
your PATH, so it is run through poetry:

```bash
poetry run song-finder                    # the TUI
poetry run song-finder search asymmetric
```

If you ever want it on your PATH instead — handy for asking "what is this mp3?"
from whatever folder you happen to be standing in:

```bash
pipx install --editable ~/projects/mazy_suite/song_finder
song-finder search asymmetric             # from anywhere
```

`--editable` means edits to the source take effect without reinstalling. Run
from outside the suite, it can no longer find the data folder by walking up from
the current directory — give it the paths once in
`~/.config/mazy/song_finder.json`, as described below.

The examples from here on use the bare `song-finder`; prefix them with
`poetry run` if you skipped the pipx step.

## Where it reads from

Nothing new is stored — everything comes from the shared data folder described
in [docs/data-formats.md](../docs/data-formats.md), plus the audio on disk:

| what | from |
|---|---|
| song title, authors, date | `data/<album>.json` → `playlist[].title` |
| original collaboration file | `data/<album>.json` → `playlist[].url` |
| full original title, kompoz id | `data/<album>.md` → `Original:` and the collaboration link |
| lyrics | `data/lyrics/<Song Title>.srt` |
| the audio itself | `<music dir>/<Album>/<original file>.mp3` |

`albums.json` decides what counts as an album, so scratch playlists sitting in
the data folder stay out of the index.

Both folders are found automatically: the data folder by walking up from the
current directory looking for an `albums.json`, the music folder defaulting to
`~/Music/projects` — the local mirror of the served `/music/files/` tree.
Override either way:

```bash
song-finder --data-dir ~/projects/mazy_suite/data --music-dir ~/Music/projects search alone
export MAZY_DATA_DIR=~/projects/mazy_suite/data MAZY_MUSIC_DIR=~/Music/projects
```

or permanently, in `~/.config/mazy/song_finder.json`:

```json
{
  "data_dir": "~/projects/mazy_suite/data",
  "music_dir": "~/Music/projects"
}
```

## The interactive browser

`song-finder` with no arguments opens the TUI — the screenshot above. Results
narrow as you type; the pane on the right shows everything known about the
highlighted song, lyrics included. Songs whose audio is missing are drawn dim.

Typing goes to the search box. **Press `enter` (or `tab`) to move down into the
results** — the marking and copying keys are letters, so they only work once the
list has the focus, and the footer changes to show them.

| key | |
|---|---|
| `enter` | leave the search box, into the results |
| `space` | mark / unmark the song under the cursor |
| `a` / `x` | mark everything matching / unmark everything |
| `c` | copy the marked songs to a folder |
| `r` | reveal the file in Finder |
| `/` | back to the search box |
| `esc` | clear the search |
| `ctrl+c` | quit |

Copying with nothing marked copies the song under the cursor.

## Searching

Terms are ANDed: every one has to match somewhere. A bare term is tried against
every field; `field:term` restricts it.

```bash
song-finder search chasing memories          # anywhere
song-finder search author:brae               # by co-author
song-finder search album:couldn author:lindh # album and author
song-finder search lyrics:"gave me so much"  # a phrase in the lyrics
song-finder search orig:"gone in the"        # by collaboration file name
song-finder search id:1473518                # by kompoz collaboration id
```

Fields are `title`, `original` (aliases `orig`, `file`), `album`, `author`
(`by`), `lyrics` (`words`), `kompoz` (`id`) and `date` (`year`).

Matching ignores case, accents and punctuation, so `to this cafe` finds
*To This Café* and `couldnt make` finds *Couldn't Make*. Ranking prefers the
song title over the collaboration name over the lyrics, and a whole-field match
over a substring buried in one.

## Copying songs out

```bash
# every song on an album, named after the songs, into one folder
song-finder copy album:couldn-t-make -o ~/Desktop/couldnt-make

# check first
song-finder copy author:brae -o ~/Desktop/brae --dry-run

# keep the collaboration names instead, with lyrics alongside
song-finder copy album:revival -o ~/Desktop/revival --rename original --lyrics

# numbered, in album sub-folders
song-finder copy author:lindh -o ~/Desktop/lindh --rename numbered --by-album
```

`--rename` takes `title` (the default), `original` or `numbered`
(`04 - Asymmetric Love.mp3`). Existing files are never clobbered — a copy that
would collide gets a `(2)` suffix — unless you pass `--overwrite`.

## Other commands

```bash
song-finder show alone        # everything about the best match, lyrics included
song-finder albums            # the albums, with track counts
song-finder check             # what's missing: audio, lyrics, kompoz ids
song-finder search x --json   # machine readable, for scripting
```

`check` is the one to run when a search comes up empty — it reports tracks
whose audio is not where the playlist says it should be, and how much of the
library has lyrics indexed at all.

## Tests

```bash
poetry run pytest
```
