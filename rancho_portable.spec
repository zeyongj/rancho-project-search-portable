# -*- mode: python ; coding: utf-8 -*-

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

project_root = Path(SPECPATH)
webview_datas, webview_binaries, webview_hiddenimports = collect_all("webview")

application = Analysis(
    [str(project_root / "run.py")],
    pathex=[str(project_root / "src")],
    binaries=webview_binaries,
    datas=[
        (str(project_root / "src" / "rancho_project_search" / "web"), "rancho_project_search/web"),
        (str(project_root / "src" / "rancho_project_search" / "default_data"), "rancho_project_search/default_data"),
        *webview_datas,
    ],
    hiddenimports=webview_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=1,
)

python_archive = PYZ(application.pure)

executable = EXE(
    python_archive,
    application.scripts,
    [],
    exclude_binaries=True,
    name="Rancho Project Search",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

collected = COLLECT(
    executable,
    application.binaries,
    application.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="Rancho Project Search",
)

if sys.platform == "darwin":
    app = BUNDLE(
        collected,
        name="Rancho Project Search.app",
        icon=None,
        bundle_identifier="ca.ranchogroup.projectsearch",
        info_plist={
            "CFBundleDisplayName": "Rancho Project Search",
            "CFBundleShortVersionString": "3.0.0",
            "NSHighResolutionCapable": True,
        },
    )

