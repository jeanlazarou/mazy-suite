# lyrics_book

Leaf through `lyrics.md` the way you leaf through a book.

`lyrics.md` holds every lyric of every album, as written rather than as sung —
without the repeats, and not always in the order a song uses them. It is the
only place some of these words exist: most albums have no SRT file. This tool
reads it, pages it like a book, searches it, and keeps track of which words
have already been carried into a new song.

It reads `lyrics.md` and never writes to it.

## Running it

```
pnpm install
pnpm dev             # the book — 534 pages across 31 albums
pnpm report          # read ../lyrics.md and print what it makes of it
pnpm test
pnpm typecheck
```

`pnpm dev` reads `lyrics.md` from the suite root; set `LYRICS_FILE` to point
somewhere else, or use the file picker the app offers when it cannot find it.
`pnpm report` takes the path as an argument.

## Reading

Two pages at a time on a wide window, one on a narrow one. Albums open on their
own title page; a song starts on a fresh page, except that a short song may
share with the one before it, since songs here average twenty-odd lines. A long
song continues onto the next page.

| Key | |
|---|---|
| `←` `→`, `PgUp` `PgDn`, `Space` | turn the page |
| `Home` `End` | first and last page |
| `/` | search |
| `Esc` | close the panel |

The strip along the bottom is every album in proportion; click to jump.

## Searching

Searches words, titles, albums, authors and the `Original` title at once, and
ranks a phrase found in the lyrics above an incidental match — because the
question while reworking is usually "where did I write that line?". Narrow with
`by:`, `album:`, `words:`, `year:`, `orig:`, the same vocabulary `song_finder`
uses. Picking a result turns to that page with the words highlighted.

## Tracking what has been reused

A song that borrowed words is badged with where they came from, and the song
they came from is badged with how many later songs took from it. Both
directions are resolved from the provenance lines, so leafing answers the
question that matters while writing: have I already used this one?

## Why the file is parsed rather than rendered

`lyrics.md` looks like Markdown and is not. Handing it to a Markdown renderer
damages it: an indented lyric becomes a code block, `_words_` become emphasis
whether that was meant or not, and a `#` inside a lyric becomes a heading.

Only `# `, `## ` and the `====` separators carry structure. Everything else is
text to be shown exactly as typed.

## The grammar, as actually written

Fifteen years of typing by hand, so nothing is uniform. The parser was built
against what the file contains, not against a spec.

**Albums** are `# ` headings. The `====` separators mostly agree with them but
not always, so the heading wins and a disagreement is reported.

**Songs** are `## ` headings. The credit alone is written five ways:

```
## Paper Boats (2012-04-15) by Alex Rowe, Jean Lazarou
## The Dead Living (2018/01/07) / Mark Van Der Linden, Jean Lazarou
## All Eyes on You* (2024-05-28) Taylor Brae, Jean Lazarou
## Wanderer by (2023-09-18) Ana Ros, Jean Lazarou
## Final Words by Martina Venkova, Jean Lazarou
```

Searching for the word `by` cannot tell these apart, and it breaks on titles
that contain it (`Betrayed by Eyes`). The date can: it is the only part of a
heading that identifies itself. So the date is found first and its *position*
decides the rest — what follows it is the credit, what precedes it is the
title. Only a heading with no date falls back to looking for a separator word.

A title may also carry a variant marker (`Walking by Myself*`, `Glass Roof\*`)
or trail a qualifier that is not a date (`Hardest Part (first version)`), and a
qualifier can even trail the authors (`Insane* by (2024-06-15) … (Dubrae)`).

**Dates** are `2012-04-15`, `2017/09/10`, `June 2010`, `2014-**-**` when only
the year was remembered, and `2019-04-25/2022-07-06` when a song was picked up
again years later. A `2017/09/10` is one date and a `2019-04-25/2022-07-06` is
two, so a group is only split on `/` after it has failed to read as one date.

**Metadata** sits between the heading and the first lyric, in no fixed order
and sometimes with blank lines among it:

| Line                                             | Means                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `https://www.kompoz.com/…/collaboration/1234`    | the collaboration                                                           |
| `Original Rowing Song`                           | the title the music's composer gave the instrumental, before the vocal work |
| `"It's a Feeling" by Toto / 1982`                | words reused from another band's song — the *Anonymous Lives* convention    |
| `Lyrics from "3 AM" (2020-06-14) in "Letter 45"` | words carried over from an earlier song — the *Nothing New* convention      |

Collection stops at the first line that is none of these, so a lyric beginning
with the word `Original` stays a lyric.

### Two kinds of reuse

Reworking old words into new songs is not new here — *Nothing New* is the
second album built that way. *Anonymous Lives* did it first, reusing lines from
other bands' songs, and recorded that with the `"<title>" by <artist> / <year>`
line. *Nothing New* reuses Jean's own earlier lyrics, and records it with
`Lyrics from …`.

The book tracks both, because both answer the same question while writing: have
these words already been used, and where did they come from?

### The provenance line

`Lyrics from "<title>" (<date>) in "<album>"` is the form to write from now on.
The album disambiguates: six titles in the file are used by two songs each, so
a bare title is not enough to find the words again. The parser accepts the
looser forms already in the file (`Lyrics of …`, `… from "<album>"`, no quotes,
no album) so nothing has to be rewritten.

## The problems report

`pnpm report` reads the whole file and lists what a human should look at. It
only reads — every repair is yours to make by hand.

It replaces the working notes block sitting inside `lyrics.md` today: the
questions written there (*Monkey Money only June 2010*, *Always Stayed Off
date?*, *Hidden Rhythms date?*) are all found automatically, along with a
number that were not written down.

What it reports: songs with no date or a partial one, songs with no authors,
titles used twice, a song that follows a separator with no album heading, a
heading that is really a divider, two separators in a row, and any text sitting
outside a song.

## Tests

The fixtures are invented — same titles-and-names-changed approach as the
`player_editor` SRT fixtures — because `lyrics.md` is personal data and is not
committed. They copy the file's *grammar*, including every oddity above.
