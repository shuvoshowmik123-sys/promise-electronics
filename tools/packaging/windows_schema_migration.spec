# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Windows Schema Migration Utility.

Build with:
    pyinstaller tools/packaging/windows_schema_migration.spec

Output goes to tools/packaging/dist/ (ignored, not committed). This packages
only tools/windows_schema_migration.py and its icon — it does not bundle the
Node/TypeScript project, and the resulting .exe must still be run from inside
a verified project checkout so it can find and run the reviewed
`npm run db:migrate:main` / `npm run schema:audit:ledger` commands. It is not
a standalone server installer.
"""

from pathlib import Path

PACKAGING_DIR = Path(SPECPATH)
REPO_ROOT = PACKAGING_DIR.parent.parent
ENTRY_SCRIPT = REPO_ROOT / "tools" / "windows_schema_migration.py"
ICON_PATH = PACKAGING_DIR / "assets" / "windows_schema_migration_icon.ico"

block_cipher = None

a = Analysis(
    [str(ENTRY_SCRIPT)],
    pathex=[str(REPO_ROOT)],
    binaries=[],
    datas=[(str(ICON_PATH), "packaging/assets")],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="PromiseSchemaMigration",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=True,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON_PATH),
)
