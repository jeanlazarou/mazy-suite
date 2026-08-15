# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Commands

```bash
poetry install                 # set up
poetry run song-finder         # the TUI
poetry run pytest              # tests
poetry run black song_finder tests && poetry run isort song_finder tests
poetry run mypy song_finder    # clean, keep it that way
```

Working against the real library without installing config:

```bash
MAZY_DATA_DIR=../data poetry run song-finder search asymmetric
```

## What problem this solves

A song here has several names that do not agree, and the tool exists to bridge
them:

- the **collaboration** is downloaded from kompoz under its own title (*And Chill*)
- the **DAW project** is `And Chill (1473518)` — title plus collaboration id
- the **mix** is bounced to `And Chill.mp3`, still the collaboration name
- the **song**, once it has vocals and lyrics, is called *Asymmetric Love*

Searching has to work from any of them, and copying out has to be able to rename
the file to the song title. Nothing in the tool ever writes to the library.

## Where the data comes from

Everything is read from the shared suite data folder
([docs/data-formats.md](../docs/data-formats.md)); this project defines no
format of its own.

| what | source |
|---|---|
| song title, authors, date | `data/<album>.json` → `playlist[].title` |
| original collaboration file | `data/<album>.json` → `playlist[].url` basename |
| full original title, kompoz id | `data/<album>.md` → `Original:` line, collaboration link |
| lyrics | `data/lyrics/<Song Title>.srt` |
| audio | `<music_dir>/<Album>/<original file>.mp3` |

Two things are easy to get wrong:

- **`albums.json` is the authority** on what an album is. The data folder also
  holds scratch files (`playlist.json`, `temp.json`) that must stay out of the
  index.
- A trailing `*` or `+` on a playlist title marks a variant. It is not part of
  the name: the lyrics file has none, and a renamed copy must not carry it.
  `text.strip_variant_marker` is the single place that handles this.

## Layout

| module | |
|---|---|
| `config.py` | finding `data/` and the music root — argument, env var, config file, default |
| `library.py` | loading and joining the three per-album files into `Track`s |
| `models.py` | `Track`/`Album`, and the normalised search index built in `__post_init__` |
| `search.py` | query parsing (`field:term`, quotes), scoring, `identify()` |
| `export.py` | copying and renaming; the only module that writes anything |
| `tui.py` | the Textual app |
| `cli.py` | argparse entry point; no arguments opens the TUI |
| `text.py` | normalisation shared by indexing and matching |

## Conventions

- Normalise **both** sides of a comparison through `text.normalize`. Titles here
  carry apostrophes and accents (*Couldn't Make*, *To This Café*) and a search
  that only casefolds will miss them. `text.squeeze` additionally drops spaces,
  which is what lets `couldntmake` match.
- Matching reads only the precomputed `Track._index`, never the raw fields, so
  adding a searchable field means adding it to `SEARCHABLE_FIELDS` and to the
  index in `Track.__post_init__`.
- Missing data is reported, never fatal: a track whose audio is absent stays in
  the index and is drawn dim, an album without a `.md` simply has no kompoz id.
  Load problems collect in `Library.warnings` (shown by `-v` and by `check`).
- Copies never clobber. `export._unique` guards against both existing files and
  collisions within the same run — distinct songs can share a title.

## Tests

`tests/conftest.py` builds a miniature library on disk (real JSON, markdown, SRT
and stand-in audio) shaped exactly like the real data folder; prefer extending
it over mocking. The TUI is covered headless through Textual's pilot, driven
from plain sync tests via `asyncio.run`, so no async plugin is needed.
