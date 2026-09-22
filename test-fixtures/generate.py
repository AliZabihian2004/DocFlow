"""
Generates synthetic Persian/mixed-direction PDFs for testing the parser.

These are not a substitute for real-world documents (a Word export and an
InDesign-typeset file stress the pipeline in ways a generated file cannot), but
they give us deterministic fixtures that exercise the shaping and bidi paths
from day one.

PyMuPDF's HTML story engine is used deliberately: it performs real Arabic
shaping and runs the Unicode bidi algorithm, so the resulting PDFs contain the
same kind of glyph runs a genuine Persian document would.

Run:  python test-fixtures/generate.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf

OUT_DIR = Path(__file__).parent / "generated"

# A font with full Persian coverage. Tahoma ships with Windows; the build falls
# back to any font passed via DOCFLOW_FIXTURE_FONT for other platforms.
FONT_PATH = Path(r"C:\Windows\Fonts\tahoma.ttf")

# Persian text chosen to exercise specific failure modes:
#   - letters that must join (Ù…ÛŒâ€ŒÚ©Ù†Ø¯ uses a ZWNJ)
#   - Latin words embedded inside an RTL sentence
#   - digits, which have their own bidi class
PAGES: list[tuple[str, str]] = [
    (
        "persian-simple",
        """
        <h1>گزارش فنی</h1>
        <p>این یک سند آزمایشی برای بررسی استخراج متن فارسی است.</p>
        <h2>بخش اول</h2>
        <p>نرم‌افزار باید بتواند متن را بدون خطا بازیابی کند.</p>
        <ul>
          <li>مورد اول</li>
          <li>مورد دوم</li>
          <li>مورد سوم</li>
        </ul>
        """,
    ),
    (
        "mixed-fa-en",
        """
        <h1>Docflow Test Document</h1>
        <p>This paragraph is written in English and should stay left-to-right.</p>
        <p>این پاراگراف به زبان فارسی است و باید راست‌چین بماند.</p>
        <p>نام پروژه Docflow است و با زبان Python نوشته شده است.</p>
        <p>The version is 1.0 and the release date is 2026.</p>
        <h2>فهرست موارد</h2>
        <ol>
          <li>نصب برنامه install</li>
          <li>وارد کردن فایل import</li>
        </ol>
        """,
    ),
]


def build_pdf(name: str, body_html: str, font_path: Path) -> Path:
    """Renders one HTML snippet to a single-page PDF with a real text layer."""
    css = f"""
    @font-face {{
      font-family: fixture;
      src: url({font_path.name});
    }}
    * {{ font-family: fixture; font-size: 12pt; }}
    h1 {{ font-size: 20pt; }}
    h2 {{ font-size: 15pt; }}
    """

    # The archive tells the story engine where to find the font file referenced
    # by @font-face above.
    archive = pymupdf.Archive(str(font_path.parent))

    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)  # A4 in points
    rect = pymupdf.Rect(56, 56, 539, 786)

    spare, _ = page.insert_htmlbox(rect, body_html, css=css, archive=archive)
    if spare < 0:
        raise RuntimeError(f"{name}: content overflowed the page box")

    out_path = OUT_DIR / f"{name}.pdf"
    doc.save(str(out_path))
    doc.close()
    return out_path


def rasterise(source: Path, out_name: str) -> Path:
    """
    Produces an image-only PDF from a text PDF — our stand-in for a scanned
    document. Rendering at 200 DPI keeps it realistic for OCR without making
    the fixture enormous.
    """
    src = pymupdf.open(str(source))
    out = pymupdf.open()

    for page in src:
        pixmap = page.get_pixmap(dpi=200)
        new_page = out.new_page(width=page.rect.width, height=page.rect.height)
        new_page.insert_image(new_page.rect, pixmap=pixmap)

    out_path = OUT_DIR / f"{out_name}.pdf"
    out.save(str(out_path))
    out.close()
    src.close()
    return out_path


def main() -> int:
    font_path = FONT_PATH
    if not font_path.exists():
        print(f"Persian-capable font not found at {font_path}", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, html in PAGES:
        path = build_pdf(name, html, font_path)
        print(f"wrote {path.name}")

    scanned = rasterise(OUT_DIR / "persian-simple.pdf", "scanned-persian")
    print(f"wrote {scanned.name} (image-only, no text layer)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
