"""Build the Windows Schema Migration Utility .exe with PyInstaller.

Usage:
    python tools/packaging/build_windows_schema_migration_exe.py

Produces PromiseSchemaMigration.exe under tools/packaging/dist/ (ignored,
not committed). Intermediate PyInstaller work files go under
tools/packaging/build/ (also ignored). This script only invokes PyInstaller
against the reviewed spec file — it does not implement any migration logic
of its own.
"""

from __future__ import annotations

import sys
from pathlib import Path

PACKAGING_DIR = Path(__file__).resolve().parent
SPEC_FILE = PACKAGING_DIR / "windows_schema_migration.spec"
BUILD_DIR = PACKAGING_DIR / "build"
DIST_DIR = PACKAGING_DIR / "dist"


def main() -> int:
    try:
        import PyInstaller.__main__
    except ImportError:
        print("PyInstaller is not installed. Install it with: pip install pyinstaller", file=sys.stderr)
        return 1

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    PyInstaller.__main__.run(
        [
            str(SPEC_FILE),
            "--noconfirm",
            "--workpath",
            str(BUILD_DIR),
            "--distpath",
            str(DIST_DIR),
        ]
    )
    print(f"Built: {DIST_DIR / 'PromiseSchemaMigration.exe'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
