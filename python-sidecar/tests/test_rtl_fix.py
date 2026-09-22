"""
Tests for the RTL repair logic.

Special characters are built with explicit `chr()` codepoints rather than
written as literals. Several of the characters under test here are invisible
(ZWNJ, soft hyphen, BOM) or trivially confusable on screen (Arabic yeh versus
Persian yeh render identically in many fonts), so spelling them out by number
is the only way a reader can tell what is actually being asserted.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from parser.rtl_fix import (  # noqa: E402
    contains_rtl,
    fix_rtl,
    is_run_reversed,
    joining_form,
    normalise_characters,
    reversal_map_from_raw,
)

# --- Base letters ---------------------------------------------------------

NOON = chr(0x0646)        # ن
REH = chr(0x0631)         # ر
MEEM = chr(0x0645)        # م
ARABIC_YEH = chr(0x064A)  # ي  - wrong in Persian
FARSI_YEH = chr(0x06CC)   # ی  - correct in Persian
ARABIC_KAF = chr(0x0643)  # ك  - wrong in Persian
KEHEH = chr(0x06A9)       # ک  - correct in Persian
BEH = chr(0x0628)         # ب

# --- Presentation forms, as found inside a PDF text layer -----------------

MEEM_ISOLATED = chr(0xFEE1)
REH_FINAL = chr(0xFEAE)
NOON_INITIAL = chr(0xFEE7)
GAF_INITIAL = chr(0xFB94)
ZAIN_FINAL = chr(0xFEB0)
ALEF_ISOLATED = chr(0xFE8D)
REH_ISOLATED = chr(0xFEAD)
SHEEN_ISOLATED = chr(0xFEB5)

# --- Invisible characters -------------------------------------------------

SOFT_HYPHEN = chr(0x00AD)
NBSP = chr(0x00A0)
BOM = chr(0xFEFF)

# The word نرم as a PDF stores it when the run came out in visual order. Read
# left to right the forms are [isolated, final, initial] - and a word can never
# end with an initial form, which is what proves the reversal.
NARM_VISUAL = MEEM_ISOLATED + REH_FINAL + NOON_INITIAL
NARM_LOGICAL = NOON + REH + MEEM

# گزارش, stored correctly: starts with an initial form, so it is logical order.
GOZARESH_LOGICAL = (
    GAF_INITIAL + ZAIN_FINAL + ALEF_ISOLATED + REH_ISOLATED + SHEEN_ISOLATED
)


class TestContainsRtl:
    def test_detects_persian(self):
        assert contains_rtl(NARM_LOGICAL) is True

    def test_detects_presentation_forms(self):
        assert contains_rtl(NARM_VISUAL) is True

    def test_ignores_latin(self):
        assert contains_rtl("Hello, world. 12345") is False

    def test_empty_string_is_not_rtl(self):
        assert contains_rtl("") is False

    def test_mixed_content_counts_as_rtl(self):
        assert contains_rtl("Project " + NARM_LOGICAL) is True


class TestJoiningForm:
    @pytest.mark.parametrize(
        "char, expected",
        [
            (NOON_INITIAL, "initial"),
            (REH_FINAL, "final"),
            (MEEM_ISOLATED, "isolated"),
            (GAF_INITIAL, "initial"),
        ],
    )
    def test_reads_form_from_unicode_database(self, char, expected):
        assert joining_form(char) == expected

    def test_returns_none_for_base_letters(self):
        # A base letter carries no joining information on its own.
        assert joining_form(NOON) is None

    def test_returns_none_for_latin(self):
        assert joining_form("a") is None


class TestIsRunReversed:
    def test_run_ending_in_initial_form_is_reversed(self):
        # The decisive case: nothing can legitimately end with an initial form.
        assert is_run_reversed(NARM_VISUAL) is True

    def test_run_starting_with_initial_form_is_not_reversed(self):
        assert is_run_reversed(GOZARESH_LOGICAL) is False

    def test_run_starting_with_final_form_is_reversed(self):
        assert is_run_reversed(REH_FINAL + NOON_INITIAL) is True

    def test_single_character_is_never_reversed(self):
        # One glyph carries no ordering evidence either way.
        assert is_run_reversed(MEEM_ISOLATED) is False

    def test_empty_run_is_not_reversed(self):
        assert is_run_reversed("") is False


class TestNormaliseCharacters:
    def test_arabic_yeh_becomes_persian_yeh(self):
        assert normalise_characters(BEH + ARABIC_YEH + NOON) == BEH + FARSI_YEH + NOON

    def test_arabic_kaf_becomes_keheh(self):
        assert normalise_characters(ARABIC_KAF) == KEHEH

    def test_soft_hyphen_is_stripped(self):
        assert normalise_characters("a" + SOFT_HYPHEN + "b") == "ab"

    def test_nbsp_becomes_a_normal_space(self):
        assert normalise_characters("a" + NBSP + "b") == "a b"

    def test_bom_is_stripped(self):
        assert normalise_characters(BOM + "text") == "text"

    def test_leaves_correct_persian_untouched(self):
        assert normalise_characters(NARM_LOGICAL) == NARM_LOGICAL


class TestReversalMapFromRaw:
    def test_maps_a_reversed_run_to_its_repair(self):
        mapping = reversal_map_from_raw(NARM_VISUAL)
        assert mapping == {MEEM + REH + NOON: NARM_LOGICAL}

    def test_ignores_correctly_ordered_runs(self):
        assert reversal_map_from_raw(GOZARESH_LOGICAL) == {}

    def test_ignores_text_with_no_presentation_forms(self):
        assert reversal_map_from_raw("plain latin text") == {}


class TestFixRtl:
    def test_repairs_a_reversed_run_inside_a_merged_word(self):
        """
        The case that motivates run-level rather than word-level matching.

        pymupdf4llm drops the ZWNJ in a Persian compound, so the two runs
        arrive welded into one token. Whole-word lookup finds nothing; matching
        the reversed run as a substring still repairs it.
        """
        markdown = MEEM + REH + NOON + "افزار"
        result = fix_rtl(markdown, raw_text=NARM_VISUAL)

        assert result.text == NARM_LOGICAL + "افزار"
        assert result.words_reversed == 1
        assert result.has_rtl is True

    def test_leaves_correct_text_alone(self):
        markdown = "# " + NARM_LOGICAL
        result = fix_rtl(markdown, raw_text=GOZARESH_LOGICAL)

        assert result.text == markdown
        assert result.words_reversed == 0

    def test_markdown_markers_stay_at_the_start_of_the_line(self):
        """
        Guards the core design decision of this module.

        The conventional reshape() + get_display() recipe would move the "#" to
        the end of the line, so the heading would stop parsing as a heading.
        Output must remain in logical order for a bidi-aware editor.
        """
        markdown = "# " + NARM_LOGICAL
        result = fix_rtl(markdown, raw_text=NARM_VISUAL)

        assert result.text.startswith("# ")

    def test_output_contains_no_presentation_forms(self):
        result = fix_rtl(MEEM + REH + NOON, raw_text=NARM_VISUAL)
        assert all(not 0xFB50 <= ord(c) <= 0xFEFF for c in result.text)

    def test_latin_only_document_reports_no_rtl(self):
        result = fix_rtl("# Heading\n\nPlain English text.")

        assert result.has_rtl is False
        assert result.words_reversed == 0

    def test_latin_only_document_still_gets_noise_stripped(self):
        result = fix_rtl("left" + SOFT_HYPHEN + "right")
        assert result.text == "leftright"

    def test_works_without_a_raw_layer(self):
        """
        OCR output has no presentation forms, so no reversal evidence exists.
        Character normalisation must still run.
        """
        result = fix_rtl(BEH + ARABIC_YEH + NOON)

        assert result.has_rtl is True
        assert result.text == BEH + FARSI_YEH + NOON
        assert result.words_reversed == 0

    def test_persian_yeh_normalisation_survives_repair(self):
        markdown = MEEM + REH + NOON + ARABIC_YEH
        result = fix_rtl(markdown, raw_text=NARM_VISUAL)

        assert ARABIC_YEH not in result.text
        assert FARSI_YEH in result.text
