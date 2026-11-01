#
# A self-contained HTML timeline of what each stage did.
#
# When a draft comes out wrong the question is always "where did it go
# wrong, and which stage did it" — and that is invisible from the SRT
# alone, because the file only shows the end of the pipeline. This draws
# every stage against the voiced audio on one time axis, so a cascade is
# visible as the moment the lanes stop agreeing with the singing.
#
# The lane labels live in their own fixed SVG beside the scrolling one,
# sharing its y coordinates, so they stay readable however far right the
# timeline is scrolled.
#
# No dependencies and no server: one file, opened in a browser.
#

import html

PX_PER_SECOND = 30
LANE_HEIGHT = 26
LANE_GAP = 8
LABELS = 90
PAD = 6

COLOURS = {
    "voiced": "#A96A06",
    "aligned": "#5A6B73",
    "anchored": "#136B77",
    "trimmed": "#5A6B73",
    "final": "#136B77",
    "heard": "#8A6A9E",
    "failed": "#9E3A50",
}


def voiced_spans(voiced, frame):
    """Merge contiguous voiced frames into (start, end) spans.

    One rect per frame would be tens of thousands of elements for a
    four-minute song; merged spans are a few hundred.
    """
    spans = []
    start = None

    for i, on in enumerate(voiced):
        if on and start is None:
            start = i
        elif not on and start is not None:
            spans.append((start * frame, i * frame))
            start = None

    if start is not None:
        spans.append((start * frame, len(voiced) * frame))

    return spans


def _x(seconds):
    return PAD + seconds * PX_PER_SECOND


def _ruler(duration, y):
    step = 10 if duration <= 300 else 30
    parts = [f'<line x1="{_x(0):.0f}" y1="{y}" x2="{_x(duration):.0f}" y2="{y}" '
             f'stroke="#B3BFBE"/>']

    for t in range(0, int(duration) + 1, step):
        x = _x(t)
        parts.append(f'<line x1="{x:.0f}" y1="{y}" x2="{x:.0f}" y2="{y + 5}" stroke="#B3BFBE"/>')
        parts.append(f'<text x="{x:.0f}" y="{y + 17}" class="tick">{t // 60}:{t % 60:02d}</text>')

    return "".join(parts)


def _lane(segments, y, colour, failed=None):
    failed = failed or set()
    parts = []

    for i, (start, end, text) in enumerate(segments):
        w = max((end - start) * PX_PER_SECOND, 1.5)
        fill = COLOURS["failed"] if i in failed else colour
        label = html.escape(f"{i + 1}. {start:.2f}–{end:.2f}  {text}")
        parts.append(
            f'<rect x="{_x(start):.1f}" y="{y}" width="{w:.1f}" '
            f'height="{LANE_HEIGHT - 8}" fill="{fill}" fill-opacity="0.55" '
            f'stroke="{fill}"><title>{label}</title></rect>'
        )

    return "".join(parts)


def _markers(matched, y):
    parts = []

    for index, time in matched:
        x = _x(time)
        label = html.escape(f"line {index + 1} matched the transcript at {time:.2f}s")
        parts.append(
            f'<polygon points="{x:.1f},{y} {x - 4:.1f},{y + 9} {x + 4:.1f},{y + 9}" '
            f'fill="{COLOURS["heard"]}"><title>{label}</title></polygon>'
        )

    return "".join(parts)


def _comparison(lines, heard, pairs):
    """Lyrics beside what the model heard there, worst matches first."""
    by_line = {i: (j, score) for i, j, score in pairs}
    rows = []

    for i, line in enumerate(lines):
        j, score = by_line.get(i, (None, 0.0))
        got = heard[j][2].strip() if j is not None else ""
        cls = "bad" if score < 0.45 else ("mid" if score < 0.8 else "good")
        rows.append(
            f'<tr class="{cls}"><td class="n">{i + 1}</td>'
            f'<td>{html.escape(line)}</td><td>{html.escape(got) or "—"}</td>'
            f'<td class="n">{score:.2f}</td></tr>'
        )

    weak = sum(1 for i in range(len(lines)) if by_line.get(i, (None, 0.0))[1] < 0.45)

    return weak, (
        '<table><thead><tr><th>#</th><th>your lyrics</th>'
        '<th>what the model heard</th><th>match</th></tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table>'
    )


def render(song, duration, voiced, frame, stages, notes, heard=None,
           failed=None, matched=(), lines=None, pairs=()):
    """Build the whole page. stages is [(name, segments), ...]."""
    names, label_parts, body = [], [], []
    y = 10

    def label(text, at, height=LANE_HEIGHT - 8):
        label_parts.append(
            f'<text x="{LABELS - 10}" y="{at + height - 6}" class="lane">'
            f'{html.escape(text)}</text>'
        )

    if voiced is not None:
        label("voiced", y)
        for a, b in voiced_spans(voiced, frame):
            body.append(
                f'<rect x="{_x(a):.1f}" y="{y}" width="{max((b - a) * PX_PER_SECOND, 1):.1f}" '
                f'height="{LANE_HEIGHT - 8}" fill="{COLOURS["voiced"]}" fill-opacity="0.5"/>'
            )
        y += LANE_HEIGHT + LANE_GAP

    if heard:
        label("transcript", y)
        body.append(_lane(heard, y, COLOURS["heard"]))
        y += LANE_HEIGHT + LANE_GAP

    if matched:
        label("matched", y, 12)
        body.append(_markers(matched, y))
        y += 16 + LANE_GAP

    for name, segments in stages:
        label(name, y)
        body.append(_lane(segments, y, COLOURS.get(name, "#5A6B73"),
                          failed if name == "aligned" else None))
        names.append(name)
        y += LANE_HEIGHT + LANE_GAP

    body.append(_ruler(duration, y))
    height = y + 30
    width = _x(duration) + 40

    warn = "".join(f"<li>{html.escape(n)}</li>" for n in notes)
    warn_block = (
        f'<div class="warn"><strong>Signs of a lost alignment</strong><ul>{warn}</ul></div>'
        if notes else '<div class="ok">No warning signatures in the final draft.</div>'
    )

    fail_note = (
        f'<p class="meta">{len(failed)} line(s) came back from the aligner with zero '
        f'duration — red on the <em>aligned</em> lane. These are what the invariant pass '
        f'turns into minimum-length regions, and they are the seed of every collapsed '
        f'run.</p>' if failed else ""
    )
    heard_note = (
        f'<p class="meta">The <em>transcript</em> lane is what whisper hears when it is '
        f'<em>not</em> given the lyrics — {len(heard)} segments. Words are often wrong on '
        f'singing; what matters is that it is independent evidence of <em>when</em> '
        f'something is sung.</p>' if heard else ""
    )
    match_note = (
        f'<p class="meta">{len(matched)} line(s) matched well enough to act as control '
        f'points — the triangles. Long stretches without one are where '
        f'<code>--anchor</code> has nothing to pull the draft onto.</p>'
        if matched else ""
    )

    table_block = ""
    if lines and heard:
        weak, table = _comparison(lines, heard, pairs)
        table_block = (
            f'<details open><summary>Your lyrics against what the model heard '
            f'({weak} of {len(lines)} lines barely recognised)</summary>'
            f'<p class="meta">Rows are shaded by how closely the transcript matches your '
            f'line. Poor matches are where the model could not make out the singing — '
            f'those lines give <code>--anchor</code> nothing to work with.</p>'
            f'{table}</details>'
        )

    return f"""<!doctype html>
<meta charset="utf-8">
<title>{html.escape(song)} — srt_generator stages</title>
<style>
 body {{ font: 14px -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
        background: #F1F3F2; color: #121A20; margin: 24px; }}
 h1 {{ font-size: 20px; margin: 0 0 4px; }}
 .meta {{ color: #5A6B73; margin: 4px 0 16px; max-width: 74ch; }}
 .warn {{ background: #F6E1E4; border-left: 3px solid #9E3A50; padding: 10px 14px;
          margin: 0 0 16px; max-width: 74ch; }}
 .ok {{ background: #DCEDEE; border-left: 3px solid #136B77; padding: 10px 14px;
        margin: 0 0 16px; max-width: 74ch; }}
 .warn ul {{ margin: 6px 0 0; padding-left: 18px; }}
 .chart {{ display: flex; align-items: flex-start; background: #fff;
           border: 1px solid #D2D9D8; }}
 .chart .labels {{ flex: none; background: #fff; border-right: 1px solid #D2D9D8;
                   position: sticky; left: 0; z-index: 2; }}
 .scroll {{ overflow-x: auto; flex: 1; min-width: 0; }}
 text.lane {{ font: 11px ui-monospace, Menlo, monospace; fill: #5A6B73; text-anchor: end; }}
 text.tick {{ font: 10px ui-monospace, Menlo, monospace; fill: #5A6B73; text-anchor: middle; }}
 rect {{ shape-rendering: crispEdges; }}
 details {{ margin-top: 24px; background: #fff; border: 1px solid #D2D9D8;
            padding: 12px 16px; }}
 summary {{ cursor: pointer; font-weight: 600; }}
 table {{ border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 13px; }}
 th {{ text-align: left; border-bottom: 1px solid #B3BFBE; padding: 4px 10px 4px 0;
       font: 11px ui-monospace, Menlo, monospace; color: #5A6B73;
       text-transform: uppercase; letter-spacing: .08em; }}
 td {{ padding: 4px 10px 4px 0; border-bottom: 1px solid #EDF0EF; vertical-align: top; }}
 td.n {{ font: 12px ui-monospace, Menlo, monospace; color: #5A6B73;
         text-align: right; white-space: nowrap; }}
 tr.bad td {{ background: #F6E1E4; }}
 tr.mid td {{ background: #F5E7CE; }}
</style>
<h1>{html.escape(song)}</h1>
<p class="meta">Each lane is one stage of the pipeline, on a shared time axis at
 {PX_PER_SECOND} px per second. Hover any region for its index, times and text.
 Where a lane stops lining up with <em>voiced</em>, that is where the alignment
 went wrong.</p>
{warn_block}
{fail_note}
{heard_note}
{match_note}
<div class="chart">
  <svg class="labels" width="{LABELS}" height="{height}"
    xmlns="http://www.w3.org/2000/svg">{"".join(label_parts)}</svg>
  <div class="scroll"><svg width="{width:.0f}" height="{height}"
    xmlns="http://www.w3.org/2000/svg">{"".join(body)}</svg></div>
</div>
{table_block}
"""


def write(path, song, duration, voiced, frame, stages, notes, heard=None,
          failed=None, matched=(), lines=None, pairs=()):
    path.write_text(
        render(song, duration, voiced, frame, stages, notes, heard, failed,
               matched, lines, pairs),
        encoding="utf-8",
    )
