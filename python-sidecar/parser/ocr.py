"""
OCR extraction (Path B).

Used for scanned PDFs with no usable text layer. Each page is rasterised with
PyMuPDF and handed to Tesseract with both the Persian and English language
packs loaded, so mixed-language scans do not have to be split up first.
"""

from __future__ import annotations

import os
import shutil
import threading
from dataclasses import dataclass

import pymupdf
import pytesseract
from PIL import Image

from .progress import ProgressReporter
from .rtl_fix import contains_rtl, fix_rtl

# 300 DPI is the resolution Tesseract is trained for. Lower is faster but costs
# noticeable accuracy on Persian diacritics; higher mostly costs time.
OCR_DPI = 300

# Both packs at once, so mixed-language scans do not have to be split up first.
#
# Worth knowing when tuning: on a Persian-only document, "fas" alone is
# measurably more accurate. With "eng" also loaded, Tesseract will occasionally
# decide a Persian word is English and emit Latin gibberish for it - in testing,
# it read برای as "Sly" and متن as "Yio". The cost is only paid on documents
# that really are Persian-only, which is why this is a user-facing setting
# rather than a hardcoded value.
OCR_LANGUAGES = "fas+eng"

# How long one page may take before we tell the user it is running slowly.
STALL_SECONDS = 15.0

# Where Tesseract usually lives when it is not on PATH. Shipped users will
# almost never have it on PATH, so falling back to these is the difference
# between "works" and "mysteriously broken" on someone else's machine.
_FALLBACK_BINARIES = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract",
    "/usr/local/bin/tesseract",
    "/opt/homebrew/bin/tesseract",
)


class TesseractNotFoundError(RuntimeError):
    """Raised when no Tesseract binary can be located."""


@dataclass
class OcrResult:
    """Raw OCR output for a whole document, before markdown tidying."""

    text: str
    has_rtl: bool
    words_reversed: int = 0


def find_tesseract(explicit_path: str | None = None) -> str:
    """
    Locate the Tesseract binary.

    Resolution order, most specific first:
      1. a path the user set in Settings
      2. the DOCFLOW_TESSERACT_PATH environment variable
      3. PATH
      4. the usual per-platform install locations

    Raising a named error here means the UI can offer "set its location in
    Settings" instead of surfacing a bare FileNotFoundError from a subprocess.
    """
    candidates = [
        explicit_path,
        os.environ.get("DOCFLOW_TESSERACT_PATH"),
        shutil.which("tesseract"),
        *_FALLBACK_BINARIES,
    ]

    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate

    raise TesseractNotFoundError(
        "Tesseract OCR was not found. Install it, or set its location in Settings."
    )


def available_languages(tesseract_path: str) -> list[str]:
    """List the language packs the installed Tesseract can use."""
    pytesseract.pytesseract.tesseract_cmd = tesseract_path
    try:
        return sorted(pytesseract.get_languages(config=""))
    except Exception:
        # An unreadable tessdata directory should not take the whole parse down.
        return []


def _ocr_page(page: pymupdf.Page, languages: str) -> str:
    """Rasterise one page and run Tesseract over it."""
    pixmap = page.get_pixmap(dpi=OCR_DPI)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    return pytesseract.image_to_string(image, lang=languages)


def extract_scanned_pdf(
    document: pymupdf.Document,
    reporter: ProgressReporter,
    tesseract_path: str | None = None,
    languages: str = OCR_LANGUAGES,
) -> OcrResult:
    """
    Run the OCR path end to end.

    Tesseract returns Unicode in logical order with base letters already, so
    the RTL work here is lighter than on the text-layer path - mostly Persian
    character normalisation. There are no presentation forms to mine for
    reversal evidence, so `fix_rtl` is called without a raw layer.
    """
    binary = find_tesseract(tesseract_path)
    pytesseract.pytesseract.tesseract_cmd = binary

    reporter.switching_to_ocr()

    page_count = document.page_count
    pages: list[str] = []

    for index in range(page_count):
        reporter.page_ocr(index + 1, page_count)

        # Warn the user if this page runs long, rather than going silent.
        stall_timer = threading.Timer(
            STALL_SECONDS,
            reporter.page_stalled,
            args=(index + 1, page_count),
        )
        stall_timer.daemon = True
        stall_timer.start()
        try:
            pages.append(_ocr_page(document[index], languages))
        finally:
            stall_timer.cancel()

    text = "\n\n".join(pages)
    has_rtl = contains_rtl(text)
    reporter.set_has_rtl(has_rtl)

    words_reversed = 0
    if has_rtl:
        reporter.fixing_direction()
        result = fix_rtl(text)
        text = result.text
        words_reversed = result.words_reversed

    return OcrResult(text=text, has_rtl=has_rtl, words_reversed=words_reversed)
