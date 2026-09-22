"""
Docflow parsing sidecar.

Runs as a long-lived child process of the Electron main process. It reads one
JSON message per line from stdin and writes one JSON message per line to
stdout; it is never spawned fresh per request, because loading PyMuPDF and its
dependencies costs far more than any single parse.

Message shapes
--------------
    in   {"id": "<uuid>", "method": "parse_pdf", "params": {...}}
    out  {"id": "<uuid>", "type": "progress", "data": {...}}
    out  {"id": "<uuid>", "type": "result",   "data": {...}}
    out  {"id": "<uuid>", "type": "error",    "error": {"message": ..., "phase": ...}}

Every response carries the `id` of the request that caused it, so the main
process can match a reply to the promise waiting on it.

A CLI mode is also provided for development:

    python main.py --file some.pdf [--out result.md]
"""

from __future__ import annotations

import argparse
import json
import sys
import traceback
from typing import Any

import pymupdf

from parser.ocr import TesseractNotFoundError, available_languages, find_tesseract
from parser.pipeline import parse_pdf
from parser.progress import ProgressReporter

# The renderer sends and expects UTF-8. Windows consoles frequently default to
# a legacy code page - this machine reports cp1256, which cannot represent the
# Persian letter U+06CC at all - so the encoding is pinned explicitly rather
# than inherited. Without this, Persian output is silently destroyed.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", newline="\n")
sys.stderr.reconfigure(encoding="utf-8")


def write_message(payload: dict[str, Any]) -> None:
    """Write one newline-delimited JSON message and flush immediately."""
    # ensure_ascii=False keeps Persian readable on the wire; the transport is
    # UTF-8 either way, and escaping it would triple the size of every message.
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


# --- Methods --------------------------------------------------------------


def method_parse_pdf(request_id: str, params: dict[str, Any]) -> dict[str, Any]:
    """Parse a PDF, streaming progress events as it goes."""
    path = params.get("path")
    if not path:
        raise ValueError("parse_pdf requires a 'path' parameter")

    def emit_progress(data: dict[str, Any]) -> None:
        write_message({"id": request_id, "type": "progress", "data": data})

    reporter = ProgressReporter(emit_progress)
    result = parse_pdf(
        path,
        reporter,
        params.get("tesseractPath"),
        params.get("ocrLanguages"),
    )

    return {
        "markdown": result.markdown,
        "pageCount": result.page_count,
        "hasRtl": result.has_rtl,
        "pathUsed": result.path_used,
        "wordsReversed": result.words_reversed,
    }


def method_ping(_request_id: str, _params: dict[str, Any]) -> dict[str, Any]:
    """Liveness check used by the main process after spawning or respawning."""
    return {"ok": True, "pymupdf": pymupdf.__doc__ or "", "python": sys.version}


def method_ocr_info(_request_id: str, params: dict[str, Any]) -> dict[str, Any]:
    """Report whether Tesseract is usable and which languages it has."""
    try:
        binary = find_tesseract(params.get("tesseractPath"))
    except TesseractNotFoundError as error:
        return {"available": False, "reason": str(error), "languages": []}

    return {
        "available": True,
        "path": binary,
        "languages": available_languages(binary),
    }


METHODS = {
    "parse_pdf": method_parse_pdf,
    "ping": method_ping,
    "ocr_info": method_ocr_info,
}


# --- Dispatch -------------------------------------------------------------


def handle_request(message: dict[str, Any]) -> None:
    """
    Run one request and write exactly one terminal response.

    Every failure is converted into an error message. The sidecar must survive
    a malformed or corrupt PDF: crashing would take down the process that the
    next request depends on.
    """
    request_id = message.get("id", "unknown")
    method_name = message.get("method", "")
    params = message.get("params") or {}

    method = METHODS.get(method_name)
    if method is None:
        write_message(
            {
                "id": request_id,
                "type": "error",
                "error": {"message": f"Unknown method: {method_name}", "phase": "dispatch"},
            }
        )
        return

    try:
        data = method(request_id, params)
        write_message({"id": request_id, "type": "result", "data": data})

    except TesseractNotFoundError as error:
        write_message(
            {"id": request_id, "type": "error", "error": {"message": str(error), "phase": "ocr"}}
        )

    except pymupdf.FileDataError as error:
        write_message(
            {
                "id": request_id,
                "type": "error",
                "error": {"message": f"This file is not a readable PDF: {error}", "phase": "opening"},
            }
        )

    except FileNotFoundError:
        write_message(
            {
                "id": request_id,
                "type": "error",
                "error": {"message": "The file could not be found.", "phase": "opening"},
            }
        )

    except Exception as error:  # noqa: BLE001 - the loop must never die
        # The traceback goes to stderr, which the main process logs; the user
        # gets the message only.
        traceback.print_exc(file=sys.stderr)
        write_message(
            {
                "id": request_id,
                "type": "error",
                "error": {"message": str(error) or error.__class__.__name__, "phase": "parsing"},
            }
        )


def serve() -> int:
    """Read newline-delimited JSON requests from stdin until the stream closes."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            message = json.loads(line)
        except json.JSONDecodeError as error:
            write_message(
                {
                    "id": "unknown",
                    "type": "error",
                    "error": {"message": f"Malformed JSON request: {error}", "phase": "protocol"},
                }
            )
            continue

        handle_request(message)

    return 0


# --- CLI mode -------------------------------------------------------------


def run_cli(args: argparse.Namespace) -> int:
    """Parse one file and print the markdown, for development and debugging."""

    def emit_progress(data: dict[str, Any]) -> None:
        print(f"  [{data['percent']:5.1f}%] {data['message']}", file=sys.stderr)

    reporter = ProgressReporter(emit_progress)

    try:
        result = parse_pdf(args.file, reporter, args.tesseract, args.languages)
    except (TesseractNotFoundError, pymupdf.FileDataError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    summary = (
        f"  pages={result.page_count} path={result.path_used} "
        f"rtl={result.has_rtl} reversed_words={result.words_reversed}"
    )
    print(summary, file=sys.stderr)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(result.markdown)
        print(f"  wrote {args.out}", file=sys.stderr)
    else:
        sys.stdout.write(result.markdown)

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Docflow PDF parsing sidecar")
    parser.add_argument("--file", help="parse this PDF and exit (development mode)")
    parser.add_argument("--out", help="write CLI markdown output to this file")
    parser.add_argument("--tesseract", help="explicit path to the Tesseract binary")
    parser.add_argument(
        "--languages",
        help='OCR language packs, e.g. "fas+eng" or "fas" (default: fas+eng)',
    )
    args = parser.parse_args()

    if args.file:
        return run_cli(args)

    return serve()


if __name__ == "__main__":
    raise SystemExit(main())
