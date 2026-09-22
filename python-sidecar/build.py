"""
Compile the sidecar into a standalone executable with PyInstaller.

The result lands in resources/python-dist/, which electron-builder copies into
the packaged app via its extraResources rule. src/main/python-bridge/sidecar.ts
looks for it there at runtime.

Run from the python-sidecar directory, inside the virtualenv:

    python build.py              # one-folder build (default)
    python build.py --onefile    # single executable

Why one-folder is the default
-----------------------------
`pymupdf4llm` pulls in `pymupdf_layout`, which pulls in `onnxruntime` - a hard
dependency, not an optional one; blocking the import stops parsing outright.
That makes the bundle large, and a --onefile build of a large bundle unpacks
itself into a temporary directory on *every* launch. The sidecar starts with
the app, so that cost would be paid on every single start. One-folder starts
immediately and the user never sees the directory, since it lives inside the
installed app.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent.resolve()
DIST_DIR = HERE.parent / "resources" / "python-dist"
BUILD_DIR = HERE / "build"

EXECUTABLE_NAME = "docflow-sidecar"


def human_size(num_bytes: int) -> str:
    size = float(num_bytes)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def directory_size(path: Path) -> int:
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def build(onefile: bool) -> int:
    if not (HERE / "main.py").exists():
        print("build.py must be run from the python-sidecar directory", file=sys.stderr)
        return 1

    # A stale dist directory would leave the previous build's files behind and
    # make it impossible to tell what this build actually produced.
    if DIST_DIR.exists():
        for child in DIST_DIR.iterdir():
            if child.name == ".gitkeep":
                continue
            shutil.rmtree(child) if child.is_dir() else child.unlink()

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--name",
        EXECUTABLE_NAME,
        # Console mode is required: the whole protocol is stdin/stdout. The
        # window it would otherwise show is suppressed by the `windowsHide`
        # option where the main process spawns this.
        "--console",
        "--distpath",
        str(DIST_DIR),
        "--workpath",
        str(BUILD_DIR),
        "--specpath",
        str(BUILD_DIR),
        "--onefile" if onefile else "--onedir",
        # pymupdf.layout loads ONNX model definitions from data files next to
        # its source at import time. PyInstaller only traces Python imports, so
        # without this the frozen build dies on startup looking for
        # pymupdf/layout/resources/onnx/*.yaml. Only ever seen in a packaged
        # build, never in development.
        "--collect-data",
        "pymupdf",
        "--collect-all",
        "onnxruntime",
        # PyInstaller cannot see these through pytesseract's indirection.
        "--hidden-import",
        "PIL._tkinter_finder",
        # Tkinter is never used and drags in a large, platform-specific
        # dependency that breaks builds on minimal CI images.
        "--exclude-module",
        "tkinter",
        "--exclude-module",
        "pytest",
        str(HERE / "main.py"),
    ]

    print("running:", " ".join(command[2:]), flush=True)
    result = subprocess.run(command, cwd=HERE)
    if result.returncode != 0:
        return result.returncode

    return report()


def report() -> int:
    """Confirm the executable exists where the app expects it, and how big."""
    suffix = ".exe" if sys.platform == "win32" else ""
    candidates = [
        DIST_DIR / f"{EXECUTABLE_NAME}{suffix}",
        DIST_DIR / EXECUTABLE_NAME / f"{EXECUTABLE_NAME}{suffix}",
    ]

    for path in candidates:
        if path.exists():
            print(f"\nexecutable: {path}")
            print(f"  size:     {human_size(path.stat().st_size)}")
            print(f"  bundle:   {human_size(directory_size(DIST_DIR))} total")
            return 0

    print("\nbuild finished but no executable was found in", DIST_DIR, file=sys.stderr)
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Docflow sidecar binary")
    parser.add_argument(
        "--onefile",
        action="store_true",
        help="produce a single executable instead of a folder (slower to start)",
    )
    args = parser.parse_args()

    return build(args.onefile)


if __name__ == "__main__":
    raise SystemExit(main())
