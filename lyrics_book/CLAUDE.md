# CLAUDE.md

Guidance for Claude Code working in `lyrics_book/`, one tool of the mazy suite.

## What this is

A reader for `lyrics.md`, the master lyrics document at the suite root: every
lyric of every album, as written rather than as sung. Most albums have no SRT
file, so for many songs this is the only place the words exist.

It was started for the **Nothing New** album, which reworks the lyrics of past
songs onto new compositions with new vocal lines. So the tool has to do two
things: let you leaf through the whole body of work like a book, and keep track
of which words have already been carried into a new song.

**It reads `lyrics.md` and never writes to it.** That was a deliberate choice —
the file is hand-maintained and 152 KB of irreplaceable personal writing. The
tool reports what it finds; every repair is the user's to make by hand.

## Commands

```
pnpm install
pnpm dev             # the book
pnpm report          # parse ../lyrics.md and print the problems report
pnpm test            # vitest
pnpm typecheck
pnpm build
```

`pnpm report` takes an optional path if `lyrics.md` is not at `../lyrics.md`.

## Hard constraints

**`lyrics.md` is gitignored personal data. Never commit it, never copy its
content into the repo, never paste lyrics into a test, a fixture, a commit
message or a doc.** Test fixtures are *invented* — they copy the file's grammar
with made-up titles, names and words, the same way `player_editor/test/*.srt`
does. This is the one rule that must not be broken.

**Never render the file as Markdown.** It looks like Markdown and is not.
A Markdown renderer turns an indented lyric into a code block, `_words_` into
emphasis whether or not that was meant, and a `#` inside a lyric into a
heading. Only `# `, `## ` and the `====` separators carry structure; everything
else is text shown exactly as typed.

**The parser must never throw.** A reader that refuses to open a 337-song file
over one malformed heading is useless. Anything surprising becomes an `Anomaly`
and the scan carries on.

**Do not delete the structural checks because they currently find nothing.**
The file was tidied in September 2026, so the divider-heading, orphan-song,
repeated-separator and loose-text checks all come back clean. They are the net
that catches the next drift in a file that is hand-maintained and still growing;
without them a stray song is silently filed under the wrong album. The heading
grammar below is where the real complexity lives, and none of it went away.

## Architecture

```
src/parser/    lyrics.md -> Album[] / Song[] / Anomaly[]   (pure, no DOM)
src/book/      pagination and the page-turn
src/search/    the index and the field:term query
scripts/       the problems report
```

The parser is pure and has no DOM dependency, so it runs under both vitest and
`tsx` for the report. Keep it that way.

### Reading a heading

The credit is written five ways across the file:

```
## Paper Boats (2012-04-15) by Alex Rowe, Jean Lazarou
## The Dead Living (2018/01/07) / Mark Van Der Linden, Jean Lazarou
## All Eyes on You* (2024-05-28) Taylor Brae, Jean Lazarou
## Wanderer by (2023-09-18) Ana Ros, Jean Lazarou
## Final Words by Martina Venkova, Jean Lazarou
```

Searching for the word `by` cannot separate these and breaks on titles that
contain it (`Betrayed by Eyes`) — that mistake was made once already and
mis-parsed twelve songs. **Anchor on the date instead:** it is the only part of
a heading that identifies itself, so find it first and let its *position*
decide — what follows it is the credit, what precedes it is the title. Only a
heading with no date falls back to looking for a separator word.

See `README.md` for the full grammar, including dates, variant markers and
qualifiers.

### Two kinds of reuse

Both are tracked, because both answer "have these words been used before?":

- `Lyrics from "3 AM" (2020-06-14) in "Letter 45"` — Jean's own earlier lyrics,
  the *Nothing New* convention. **This is the canonical form to write.** The
  album matters: six titles in the file are used by two songs each, so a bare
  title cannot find the words again. The parser also accepts the looser forms
  already in the file, so nothing has to be rewritten.
- `"It's a Feeling" by Toto / 1982` — words reused from another band's song,
  the older *Anonymous Lives* convention.

### `Original` is not provenance

`Original Rowing Song` is the title the **music's composer** gave the
instrumental before Jean wrote the vocal line — not a lyrics source. It is a
suite-wide convention, also parsed by `song_finder`. Do not conflate it with
the reuse lines above.

## Related tools

`song_finder` (Python) also parses an `Original:` line, but from
`data/<album>.md`, which is a different format entirely — album descriptions
with `$T:` markers. It does not read `lyrics.md`. There is no shared code.

## House style

Match the suite: module-level comments explaining *why*, not restating the
code. Comment the surprises — the file's irregularities are the whole story
here, and a rule that looks arbitrary usually encodes a real heading somewhere
in `lyrics.md`. Prefer plain functions and plain data over classes.
