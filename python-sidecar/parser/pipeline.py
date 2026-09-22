"""
Parse orchestration: picks the extraction path and runs it.

Keeping this separate from `main.py` means the pipeline can be driven from a
test or the CLI without going anywhere near the JSON protocol.
"""

from __future__ import annotations

import os
import re

import pymupdf

from .extract import ExtractionResult, extract_text_pdf, has_text_layer, tidy_markdown
from .ocr import OCR_LANGUAGES, extract_scanned_pdf
from .progress import ProgressReporter

# OCR returns hard-wrapped lines. A line that ends mid-sentence is a wrap, not a
# paragraph break, so we rejoin those and keep genuine blank-line breaks.
_SINGLE_NEWLINE = re.compile(r"(?<!\n)\n(?!\n)")


def ocr_text_to_markdown(text: str) -> str:
    """
    Turn raw OCR output into something markdown-shaped.

    Deliberately conservative: OCR gives us no reliable structural signal, so
    inventing headings from font size we cannot see would produce confident
    nonsense. Paragraphs are recovered; everything else is left to the user.
    """
    paragraphs = [block.strip() for block in text.split("\n\n")]
    rejoined = [_SINGLE_NEWLINE.sub(" ", block) for block in paragraphs if block]
    return "\n\n".join(rejoined)


def parse_pdf(
    path: str,
    reporter: ProgressReporter,
    tesseract_path: str | None = None,
    ocr_languages: str | None = None,
) -> ExtractionResult:
    """
    Parse a PDF into markdown, choosing the text-layer or OCR path automatically.

    Raises `pymupdf.FileDataError` for corrupt files and `TesseractNotFoundError`
    when a scan is encountered with no OCR engine installed. `main.py` turns
    both into structured error responses.
    """
    reporter.opening()

    # PyMuPDF reports a missing file as a generic exception, which would reach
    # the user tagged with the wrong phase. Check first so the error says
    # "opening" and the UI can point at the file rather than the parser.
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    with pymupdf.open(path) as document:
        if document.needs_pass:
            raise ValueError("This PDF is password-protected and cannot be opened.")

        if has_text_layer(document):
            return extract_text_pdf(path, document, reporter)

        result = extract_scanned_pdf(
            document, reporter, tesseract_path, ocr_languages or OCR_LANGUAGES
        )
        reporter.finishing_up()

        return ExtractionResult(
            markdown=tidy_markdown(ocr_text_to_markdown(result.text)),
            page_count=document.page_count,
            has_rtl=result.has_rtl,
            path_used="ocr",
            words_reversed=result.words_reversed,
        )
