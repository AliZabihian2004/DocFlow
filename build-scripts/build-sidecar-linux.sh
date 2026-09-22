#!/usr/bin/env bash
#
# Build the Python sidecar for Linux.
#
# PyInstaller cannot cross-compile, so this must run on Linux. Build on the
# oldest glibc you intend to support: the binary will run on that version and
# newer, but not older.
#
# Tesseract is a separate runtime dependency and is not bundled - install it
# with `apt install tesseract-ocr tesseract-ocr-fas` for OCR support.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$SCRIPT_DIR/../python-sidecar"
VENV_PYTHON="$SIDECAR_DIR/.venv/bin/python"

cd "$SIDECAR_DIR"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "Creating virtualenv..."
  python3 -m venv .venv
  "$VENV_PYTHON" -m pip install --upgrade pip
  "$VENV_PYTHON" -m pip install -r requirements-dev.txt
fi

echo "Building sidecar for Linux..."
"$VENV_PYTHON" build.py "$@"
