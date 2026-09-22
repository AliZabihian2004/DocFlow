"""
Right-to-left text repair for extracted PDF content.

Why this module does not use reshape() + get_display()
------------------------------------------------------
The usual recipe for Arabic/Persian in Python is `arabic_reshaper.reshape()`
followed by `bidi.algorithm.get_display()`. That pair is correct when drawing
text into a renderer that performs no shaping and no bidi of its own -
matplotlib, reportlab, a raw image canvas. It converts logical order into
*visual* order.

Docflow's output goes somewhere else entirely: a `.md` file and a
Chromium-based editor. Both expect logical order with base letters, and
Chromium runs the full Unicode bidi algorithm itself. Feeding it visually
ordered text applies bidi twice and reverses every Persian run - the exact bug
this app exists to prevent. It also relocates markdown markers: a heading
`# <title>` becomes `<title> #`, which no longer parses as a heading.

So the job here is the inverse: take whatever the PDF gave us and guarantee
logical order with normalised base letters.

How reversed text is detected
-----------------------------
Structurally, without guessing and without a dictionary.

Arabic script encodes joining context in its presentation forms. A letter in
`<initial>` form can only begin a word; a letter in `<final>` form can only end
one. PyMuPDF's raw text layer preserves those forms, so the shape of the first
and last glyph in a run tells us which direction it was stored in:

    a three-letter word stored visually arrives as
        [meem isolated, reh final, noon initial]
    which ends in an *initial* form. That is impossible in logical order,
    so the run is reversed.

`pymupdf4llm` normalises those forms away - helpfully, since its output is
usually already correct - so we read the raw layer alongside it to recover the
signal, build a map of the runs it proves were stored backwards, and repair the
markdown against that map.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# Arabic-script detection. Covers the core Arabic block (all Persian letters)
# plus presentation forms A and B, the pre-shaped variants found inside PDFs.
_RTL_PATTERN = re.compile("[\\u0600-\\u06FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF]")
_PRESENTATION_RUN = re.compile("[\\uFB50-\\uFDFF\\uFE70-\\uFEFF]+")

# Characters Persian text should never contain, mapped to their correct Persian
# equivalents. PDF producers routinely emit the Arabic forms instead, which
# breaks search and string comparison even though it looks identical on screen.
_CHARACTER_FIXES = {
    "\u064a": "\u06cc",  # ARABIC YEH          -> FARSI YEH
    "\u0649": "\u06cc",  # ALEF MAKSURA        -> FARSI YEH
    "\u0643": "\u06a9",  # ARABIC KAF          -> KEHEH
    "\u06c0": "\u0647",  # HEH WITH YEH ABOVE  -> HEH
}

# Cosmetic noise that PDF text layers pick up and markdown does not want.
_NOISE_FIXES = {
    "\u00ad": "",   # SOFT HYPHEN, inserted at line-break opportunities
    "\u00a0": " ",  # NO-BREAK SPACE, used by PDF producers as a word gap
    "\ufeff": "",   # BOM / zero-width no-break space
}


def contains_rtl(text: str) -> bool:
    """
    True if the text contains any Arabic-script character.

    Drives the `has_rtl_content` flag in progress messages, which is what stops
    the UI showing a "Fixing text direction" status line on documents that have
    no RTL content at all.
    """
    return _RTL_PATTERN.search(text) is not None


def joining_form(char: str) -> str | None:
    """
    Return 'isolated' | 'final' | 'initial' | 'medial' for a presentation-form
    character, or None if this is not a presentation form.

    Read straight out of the Unicode database: the decomposition of U+FEE7
    (NOON INITIAL FORM) is literally "<initial> 0646".
    """
    decomposition = unicodedata.decomposition(char)
    if not decomposition.startswith("<"):
        return None
    tag = decomposition[1 : decomposition.index(">")]
    return tag if tag in ("isolated", "final", "initial", "medial") else None


def is_run_reversed(run: str) -> bool:
    """
    Decide whether a run of presentation-form characters is stored in visual
    (reversed) order.

    The test is structural, not statistical:
      - a word cannot *end* with an initial form
      - a word cannot *begin* with a final form

    Either condition proves reversal. When neither applies - common for words
    built only from non-joining letters, which are always isolated - we report
    False and leave the text alone. Under-correcting is the right failure mode:
    it preserves text that was already fine.
    """
    if len(run) < 2:
        return False

    first = joining_form(run[0])
    last = joining_form(run[-1])

    return last == "initial" or first == "final"


def normalise_characters(text: str) -> str:
    """Apply the Persian character and noise fix-ups to a string."""
    for wrong, right in _CHARACTER_FIXES.items():
        text = text.replace(wrong, right)
    for noise, replacement in _NOISE_FIXES.items():
        text = text.replace(noise, replacement)
    return text


def _to_base_letters(run: str) -> str:
    """Fold a presentation-form run back to ordinary Persian letters."""
    return normalise_characters(unicodedata.normalize("NFKC", run))


def reversal_map_from_raw(raw_text: str) -> dict[str, str]:
    """
    Build a `broken -> fixed` map from the runs the raw layer proves are stored
    in visual order.

    Working at run level rather than word level matters. `pymupdf4llm` drops
    the zero-width non-joiner inside Persian compounds, welding two runs into a
    single token: a word stored as two runs, one of them reversed, arrives as
    one word that matches nothing in a whole-word vocabulary. Matching the
    reversed *run* as a substring repairs it regardless of how the tokens were
    later merged.

    Order matters within each entry: the run is reversed *before* NFKC, because
    NFKC expands ligatures such as lam-alef (U+FEFB -> two characters) which
    must not themselves be flipped afterwards.
    """
    mapping: dict[str, str] = {}

    for match in _PRESENTATION_RUN.finditer(raw_text):
        run = match.group()
        if not is_run_reversed(run):
            continue

        broken = _to_base_letters(run)
        fixed = _to_base_letters(run[::-1])

        # Single characters carry no ordering information, and a run that folds
        # to the same string either way needs no repair.
        if len(broken) >= 2 and broken != fixed:
            mapping[broken] = fixed

    return mapping


@dataclass
class RtlFixResult:
    """Outcome of a repair pass, so the UI and logs can report what happened."""

    text: str
    has_rtl: bool
    words_reversed: int = 0
    reversed_samples: list[str] = field(default_factory=list)


def fix_rtl(markdown: str, raw_text: str = "") -> RtlFixResult:
    """
    Repair extracted markdown in place, preserving logical order.

    `raw_text` is the unprocessed text layer for the same document. It is
    optional: without it we still normalise characters, we just cannot detect
    reversed runs, because the joining-form evidence lives only in the raw
    layer.
    """
    has_rtl = contains_rtl(markdown) or contains_rtl(raw_text)

    if not has_rtl:
        # Still strip soft hyphens and friends from Latin-only documents.
        return RtlFixResult(text=normalise_characters(markdown), has_rtl=False)

    text = normalise_characters(markdown)
    mapping = reversal_map_from_raw(raw_text) if raw_text else {}

    reversed_count = 0
    samples: list[str] = []

    # Longest first, so a long reversed run is repaired before any shorter run
    # that happens to be a substring of it.
    for broken in sorted(mapping, key=len, reverse=True):
        occurrences = text.count(broken)
        if not occurrences:
            continue

        fixed = mapping[broken]
        text = text.replace(broken, fixed)
        reversed_count += occurrences
        if len(samples) < 5:
            samples.append(f"{broken} -> {fixed}")

    return RtlFixResult(
        text=text,
        has_rtl=True,
        words_reversed=reversed_count,
        reversed_samples=samples,
    )
