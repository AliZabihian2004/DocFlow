"""
Progress reporting during a parse.

The exact wording of each phase is defined here rather than in the UI, so that
there is a single source of truth for the status line and the renderer only has
to display what it is given.

Every payload carries `has_rtl_content`, which is what lets the UI decide
whether the "Fixing text direction" line is relevant to this document at all -
it must never be shown unconditionally.
"""

from __future__ import annotations

from typing import Any, Callable

EmitFn = Callable[[dict[str, Any]], None]

# Roughly how much of the total run each phase accounts for, used to drive a
# real progress bar instead of an indeterminate spinner. Page-by-page work
# dominates, so it gets the bulk of the range.
_PHASE_START = {
    "opening": 0.0,
    "reading": 5.0,
    "ocr": 5.0,
    "structure": 80.0,
    "direction": 90.0,
    "finishing": 97.0,
}
_PAGE_PHASE_END = 80.0


class ProgressReporter:
    """
    Emits progress events for one parse run.

    Page-level updates are batched: on a 400-page document, emitting an event
    per page would flood the IPC channel for no benefit, since the UI cannot
    usefully redraw that fast.
    """

    def __init__(self, emit: EmitFn, max_page_updates: int = 20) -> None:
        self._emit = emit
        self._max_page_updates = max_page_updates
        self._has_rtl = False

    def set_has_rtl(self, has_rtl: bool) -> None:
        """Recorded once detection has run, then attached to every later event."""
        self._has_rtl = has_rtl

    def _send(self, phase: str, message: str, percent: float, **extra: Any) -> None:
        self._emit(
            {
                "phase": phase,
                "message": message,
                "percent": round(max(0.0, min(100.0, percent)), 1),
                "has_rtl_content": self._has_rtl,
                **extra,
            }
        )

    def _should_report_page(self, current: int, total: int) -> bool:
        """Report the first page, the last page, and an even spread between."""
        if total <= self._max_page_updates:
            return True
        step = max(1, total // self._max_page_updates)
        return current == 1 or current == total or current % step == 0

    def _page_percent(self, phase: str, current: int, total: int) -> float:
        start = _PHASE_START[phase]
        if total <= 0:
            return start
        return start + (_PAGE_PHASE_END - start) * (current / total)

    # --- Phases shared by both paths --------------------------------------

    def opening(self) -> None:
        self._send("opening", "Opening PDF", _PHASE_START["opening"])

    def fixing_direction(self) -> None:
        # Only ever called when RTL content was actually detected.
        self._send("direction", "Fixing text direction", _PHASE_START["direction"])

    def finishing_up(self) -> None:
        self._send("finishing", "Finishing up", _PHASE_START["finishing"])

    # --- Text-layer path ---------------------------------------------------

    def page_read(self, current: int, total: int) -> None:
        if not self._should_report_page(current, total):
            return
        self._send(
            "reading",
            f"Reading page {current} of {total}",
            self._page_percent("reading", current, total),
            current=current,
            total=total,
        )

    def extracting_structure(self) -> None:
        self._send("structure", "Extracting structure", _PHASE_START["structure"])

    # --- OCR path ----------------------------------------------------------

    def switching_to_ocr(self) -> None:
        self._send(
            "ocr_switch",
            "No selectable text found — switching to OCR",
            _PHASE_START["ocr"],
        )

    def page_ocr(self, current: int, total: int) -> None:
        if not self._should_report_page(current, total):
            return
        self._send(
            "ocr",
            f"Running OCR on page {current} of {total}",
            self._page_percent("ocr", current, total),
            current=current,
            total=total,
        )

    def page_stalled(self, current: int, total: int) -> None:
        """
        Fired when one page has been in OCR far longer than expected.

        Without this the UI sits silent on a slow page and looks hung, which is
        the single most common reason a user force-quits a working parse.
        """
        self._send(
            "stalled",
            "This page is taking longer than expected",
            self._page_percent("ocr", current, total),
            current=current,
            total=total,
        )
