from srt_generator.srt_writer import format_timestamp, postprocess, to_srt


def test_format_timestamp():
    assert format_timestamp(0) == "00:00:00,000"
    assert format_timestamp(61.5) == "00:01:01,500"
    assert format_timestamp(3600 + 2 * 60 + 3.042) == "01:02:03,042"
    assert format_timestamp(0.9996) == "00:00:01,000"


def test_postprocess_drops_empty_and_sorts():
    segments = [
        (5.0, 6.0, "second"),
        (1.0, 2.0, "first"),
        (3.0, 4.0, "   "),
    ]

    result = postprocess(segments)

    assert [text for _, _, text in result] == ["first", "second"]


def test_postprocess_enforces_min_duration():
    result = postprocess([(1.0, 1.0, "zero length")], min_duration=0.2)

    start, end, _ = result[0]
    assert end - start >= 0.2 - 1e-9


def test_postprocess_strictly_increasing():
    segments = [
        (1.0, 2.0, "a"),
        (1.0, 1.5, "b"),
        (1.0, 3.0, "c"),
    ]

    result = postprocess(segments)

    for i in range(1, len(result)):
        assert result[i][0] > result[i - 1][0]
        assert result[i][1] > result[i - 1][1]
    for start, end, _ in result:
        assert start < end


def test_postprocess_shaves_overlaps():
    segments = [
        (1.0, 5.0, "long tail"),
        (2.0, 3.0, "next"),
    ]

    result = postprocess(segments)

    assert result[0][1] <= result[1][0]


def test_to_srt_matches_player_editor_parser_expectations():
    srt = to_srt([(1.0, 2.5, "hello"), (3.0, 4.0, "world")])
    lines = srt.split("\n")

    # srt_parser.js: eachItem() bails out unless the first line is exactly "1"
    assert lines[0] == "1"
    assert lines[1] == "00:00:01,000 --> 00:00:02,500"
    assert lines[2] == "hello"
    assert lines[3] == ""
    assert lines[4] == "2"
    assert "\r" not in srt
    assert srt.endswith("world\n")
