"""
Text-layer extraction (Path A).

Used for PDFs that already carry selectable text. `pymupdf4llm` does the heavy
lifting - it recovers headings, lists and tables as markdown rather than a flat
wall of text - and we post-process its output for the artefacts it leaves
behind, plus the RTL repair in `rtl_fix`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import pymupdf
import pymupdf4llm

from .progress import ProgressReporter
from .rtl_fix import contains_rtl, fix_rtl

# Below this many characters per page on average, a PDF is treated as scanned
# and sent down the OCR path instead. Pages carrying only a header, a page
# number or a stray watermark land well under this.
MIN_CHARS_PER_PAGE = 50

# pymupdf4llm turns a bulleted list into a markdown list but keeps the original
# bullet glyph as literal text, producing "- - item". Strip the leftover.
_DUPLICATE_BULLET = re.compile(r"^(\s*[-*+]\s+)[•·●▪‣⁃]\s*", re.MULTILINE)

# Three or more blank lines collapse to one blank line.
_EXCESS_BLANK_LINES = re.compile(r"\n{3,}")

# Trailing spaces that pymupdf4llm leaves at the end of most lines.
_TRAILING_SPACES = re.compile(r"[ \t]+$", re.MULTILINE)


@dataclass
class ExtractionResult:
    """What the parser hands back, whichever path produced it."""

    markdown: str
    page_count: int
    has_rtl: bool
    path_used: str  # "text" or "ocr"
    words_reversed: int = 0


def has_text_layer(document: pymupdf.Document, sample_pages: int = 5) -> bool:
    """
    Decide whether a PDF has a usable text layer.

    Only the first few pages are sampled: opening every page of a 400-page
    scan just to learn it is a scan would make the "switching to OCR" message
    arrive far too late to be useful.
    """
    pages_to_check = min(sample_pages, document.page_count)
    if pages_to_check == 0:
        return False

    total_chars = sum(
        len(document[index].get_text().strip()) for index in range(pages_to_check)
    )
    return (total_chars / pages_to_check) >= MIN_CHARS_PER_PAGE


def tidy_markdown(markdown: str) -> str:
    """Clean up the cosmetic artefacts pymupdf4llm leaves in its output."""
    markdown = _DUPLICATE_BULLET.sub(r"\1", markdown)
    markdown = _TRAILING_SPACES.sub("", markdown)
    markdown = _EXCESS_BLANK_LINES.sub("\n\n", markdown)
    return markdown.strip() + "\n"


def extract_text_pdf(
    path: str,
    document: pymupdf.Document,
    reporter: ProgressReporter,
) -> ExtractionResult:
    """
    Run the text-layer extraction path end to end.

    The document is opened by the caller so that the text-layer check and this
    function share one handle rather than parsing the file twice.
    """
    page_count = document.page_count

    # Collect the raw text layer first. It still contains the pre-shaped
    # presentation forms, which is the only place the joining-form evidence
    # used to detect reversed runs survives - pymupdf4llm normalises it away.
    raw_pages: list[str] = []
    for index in range(page_count):
        raw_pages.append(document[index].get_text())
        reporter.page_read(index + 1, page_count)

    raw_text = "\n".join(raw_pages)
    has_rtl = contains_rtl(raw_text)
    reporter.set_has_rtl(has_rtl)

    reporter.extracting_structure()
    markdown = pymupdf4llm.to_markdown(document, show_progress=False)

    words_reversed = 0
    if has_rtl:
        reporter.fixing_direction()
        result = fix_rtl(markdown, raw_text)
        markdown = result.text
        words_reversed = result.words_reversed

    reporter.finishing_up()

    return ExtractionResult(
        markdown=tidy_markdown(markdown),
        page_count=page_count,
        has_rtl=has_rtl,
        path_used="text",
        words_reversed=words_reversed,
    )
