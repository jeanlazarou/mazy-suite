"""Searching: every name a song answers to has to lead back to it."""

from __future__ import annotations

from song_finder.search import identify, parse_query, search


def names(matches):
    return [match.track.name for match in matches]


class TestQueryParsing:
    def test_bare_terms_are_unscoped(self):
        terms = parse_query("chasing memories")

        assert [term.text for term in terms] == ["chasing", "memories"]
        assert all(term.field is None for term in terms)

    def test_field_prefix_scopes_a_term(self):
        (term,) = parse_query("author:brae")

        assert term.field == "author"
        assert term.text == "brae"

    def test_aliases_resolve_to_the_same_field(self):
        assert parse_query("orig:x")[0].field == parse_query("file:x")[0].field == "original"
        assert parse_query("by:x")[0].field == "author"
        assert parse_query("id:1")[0].field == "kompoz"

    def test_quotes_keep_a_phrase_together(self):
        (term,) = parse_query('lyrics:"gave me so much"')

        assert term.field == "lyrics"
        assert term.text == "gave me so much"

    def test_unknown_prefix_is_part_of_the_text(self):
        (term,) = parse_query("weird:thing")

        assert term.field is None
        assert term.text == "weird thing"


class TestFindingBySongTitle:
    def test_by_title(self, tracks):
        assert names(search(tracks, "asymmetric")) == ["Asymmetric Love"]

    def test_accents_are_ignored(self, tracks):
        assert names(search(tracks, "to this cafe")) == ["To This Café"]

    def test_run_together_still_matches(self, tracks):
        assert names(search(tracks, "asymmetriclove")) == ["Asymmetric Love"]


class TestFindingByOtherNames:
    def test_by_the_collaboration_file(self, tracks):
        assert names(search(tracks, "and chill")) == ["Asymmetric Love"]

    def test_by_the_full_original_title_from_the_markdown(self, tracks):
        assert names(search(tracks, "from here to there")) == ["So Much"]

    def test_by_author(self, tracks):
        assert names(search(tracks, "author:lindh")) == ["Asymmetric Love"]

    def test_by_kompoz_id(self, tracks):
        assert names(search(tracks, "id:1476399")) == ["To This Café"]

    def test_by_a_phrase_in_the_lyrics(self, tracks):
        matches = search(tracks, 'lyrics:"gave me so much"')

        assert names(matches) == ["So Much"]
        assert matches[0].snippet == "She gave me so much"

    def test_by_album_with_an_apostrophe(self, tracks):
        assert names(search(tracks, "album:couldnt")) == [
            "Asymmetric Love",
            "So Much",
            "To This Café",
        ]


class TestCombiningTerms:
    def test_every_term_has_to_match(self, tracks):
        assert search(tracks, "asymmetric nonsense") == []

    def test_terms_can_match_different_fields(self, tracks):
        assert names(search(tracks, "author:brae much")) == ["So Much"]

    def test_scope_confines_a_term(self, tracks):
        # 'chill' is a collaboration file name, never a song title.
        assert search(tracks, "title:chill") == []
        assert names(search(tracks, "orig:chill")) == ["Asymmetric Love"]

    def test_empty_query_returns_everything(self, tracks):
        assert len(search(tracks, "")) == len(tracks)

    def test_limit_keeps_the_best(self, tracks):
        assert len(search(tracks, "", limit=2)) == 2


class TestRanking:
    def test_title_outranks_lyrics(self, tracks):
        # 'much' is in So Much's title and in Dead Love's lyrics.
        assert names(search(tracks, "much"))[0] == "So Much"

    def test_a_whole_title_outranks_the_same_word_inside_one(self, tracks):
        matches = search(tracks, "love")

        assert names(matches) == ["Love", "Asymmetric Love", "Dead Love"]
        assert matches[0].score > matches[1].score


class TestIdentify:
    def test_from_a_bare_file_name(self, tracks):
        assert names(identify(tracks, "And Chill.mp3")) == ["Asymmetric Love"]

    def test_from_a_full_path(self, tracks):
        found = identify(tracks, "/Users/lab/Music/projects/Couldn't Make/Date Yourself.mp3")

        assert names(found) == ["To This Café"]

    def test_from_a_song_title_file(self, tracks):
        assert names(identify(tracks, "So Much.mp3")) == ["So Much"]

    def test_falls_back_to_a_general_search(self, tracks):
        assert "Asymmetric Love" in names(identify(tracks, "chill.mp3"))

    def test_nothing_matches_nothing(self, tracks):
        assert identify(tracks, "completely-unrelated.mp3") == []
