#!/usr/bin/env bash
#
# Build the Python sidecar for Windows.
#
# PyInstaller cannot cross-compile: this must run on Windows, and the macOS and
# Linux binaries must be built on their own platforms. Run this before
# `npm run build:win`, or electron-builder will package an app with no parser
# in it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIDECAR_DIR="$SCRIPT_DIR/../python-sidecar"
VENV_PYTHON="$SIDECAR_DIR/.venv/Scripts/python.exe"

cd "$SIDECAR_DIR"

if [ ! -f "$VENV_PYTHON" ]; then
  echo "Creating virtualenv..."
  python -m venv .venv
  "$VENV_PYTHON" -m pip install --upgrade pip
  "$VENV_PYTHON" -m pip install -r requirements-dev.txt
fi

echo "Building sidecar for Windows..."
"$VENV_PYTHON" build.py "$@"
