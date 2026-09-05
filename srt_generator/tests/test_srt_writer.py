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


def test_postprocess_shaving_keeps_ends_increasing():
    # "a" cannot be shaved (b starts almost with it), so its long end
    # survives; shaving "b" against c's start must then be skipped, or the
    # ends stop increasing (seen on real aligner output, "The Gravity" #19)
    segments = [
        (10.0, 30.0, "a"),
        (10.01, 30.5, "b"),
        (12.0, 13.0, "c"),
    ]

    result = postprocess(segments)

    for i in range(1, len(result)):
        assert result[i][1] > result[i - 1][1]
    for start, end, _ in result:
        assert start < end


def test_postprocess_leaves_no_overlap():
    # entries 8 and 9 of AgainsMyself.srt: the aligner opened the next
    # line 10 ms after the previous one, inside its region
    segments = [
        (21.68, 21.88, "Check"),
        (21.69, 22.02, "Against myself"),
        (22.76, 29.82, "Against myself"),
    ]

    result = postprocess(segments)

    for i in range(1, len(result)):
        assert result[i][0] >= result[i - 1][1]


def test_postprocess_caps_duration():
    result = postprocess([(10.0, 60.0, "long")], max_duration=5.0)

    start, end, _ = result[0]
    assert (start, end) == (10.0, 15.0)


def test_postprocess_cap_does_not_stretch_short_regions():
    result = postprocess([(10.0, 11.0, "short")], max_duration=5.0)

    assert result[0][:2] == (10.0, 11.0)


def test_postprocess_cap_off_by_default():
    assert postprocess([(10.0, 60.0, "long")])[0][:2] == (10.0, 60.0)


def test_postprocess_pushed_start_is_capped_from_where_it_lands():
    # the second region starts inside the first and gets pushed forward;
    # the cap must then be measured from the pushed start, not the raw one
    segments = [(10.0, 10.1, "a"), (10.05, 40.0, "b")]

    result = postprocess(segments, min_duration=0.2, max_duration=5.0)

    start, end, _ = result[1]
    assert end - start <= 5.0 + 1e-9


def test_postprocess_holds_all_invariants_on_pathological_input():
    segments = [
        (5.0, 4.0, "ends before it starts"),
        (5.0, 5.0, "zero length"),
        (4.9, 90.0, "starts earlier, runs forever"),
        (5.05, 5.4, "nested"),
        (30.0, 31.0, "clear of the pile-up"),
    ]

    result = postprocess(segments, min_duration=0.2, max_duration=5.0)

    assert len(result) == len(segments)
    for i, (start, end, _) in enumerate(result):
        assert 0 <= start < end
        assert end - start <= 5.0 + 1e-9
        if i:
            assert start > result[i - 1][0]
            assert end > result[i - 1][1]
            assert start >= result[i - 1][1]


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
