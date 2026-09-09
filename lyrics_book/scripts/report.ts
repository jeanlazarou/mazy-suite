/**
 * Read the real `lyrics.md` and print what the parser makes of it.
 *
 * This is the proofreading pass over the whole book: it replaces the working
 * notes block that currently lives inside the file itself. It only reads.
 *
 *     pnpm report                     # ../lyrics.md
 *     pnpm report path/to/lyrics.md
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseLyricsDocument } from '../src/parser/parse'
import type { Anomaly } from '../src/parser/types'

const path = resolve(process.argv[2] ?? '../lyrics.md')

function read(from: string): string {
  try {
    return readFileSync(from, 'utf8')
  } catch {
    console.error(`Cannot read ${from}`)
    console.error('Pass the path to lyrics.md, or run this from lyrics_book/ with it at ../')
    process.exit(1)
  }
}

const source = read(path)

const { albums, songs, anomalies } = parseLyricsDocument(source)

const dated = songs.filter((song) => song.dates.length)
const withProvenance = songs.filter((song) => song.provenance)
const withReference = songs.filter((song) => song.reference)
const stanzas = songs.reduce((total, song) => total + song.stanzas.length, 0)
const lyricLines = songs.reduce(
  (total, song) => total + song.stanzas.reduce((count, stanza) => count + stanza.lines.length, 0),
  0,
)

console.log(`\n  ${path}\n`)
console.log(`  albums            ${albums.length}`)
console.log(`  songs             ${songs.length}`)
console.log(`  stanzas           ${stanzas}`)
console.log(`  lyric lines       ${lyricLines}`)
console.log(`  dated             ${dated.length}/${songs.length}`)
console.log(`  reuses own lyrics ${withProvenance.length}`)
console.log(`  outside reference ${withReference.length}`)

const byKind = new Map<Anomaly['kind'], Anomaly[]>()
anomalies.forEach((anomaly) => {
  const bucket = byKind.get(anomaly.kind)
  if (bucket) bucket.push(anomaly)
  else byKind.set(anomaly.kind, [anomaly])
})

console.log(`\n  ${anomalies.length} thing${anomalies.length === 1 ? '' : 's'} to look at\n`)

const ordered = [...byKind.entries()].sort((left, right) => right[1].length - left[1].length)
for (const [kind, entries] of ordered) {
  console.log(`  ${kind} (${entries.length})`)
  for (const entry of entries) {
    console.log(`    lyrics.md:${entry.line}  ${entry.message}`)
  }
  console.log()
}

if (withProvenance.length) {
  console.log('  lyrics carried over from an earlier song\n')
  for (const song of withProvenance) {
    const { provenance } = song
    const from = [provenance!.title, provenance!.album && `in "${provenance!.album}"`]
      .filter(Boolean)
      .join(' ')
    console.log(`    ${song.name} (${song.albumTitle}) <- ${from}`)
    console.log(`      as written: ${provenance!.raw}`)
  }
  console.log()
}
