# Portable build and usage guide

## End-user usage

Download and extract the archive for your operating system. Keep the whole extracted folder together; the writable `data/` directory belongs beside the application.

### Windows 11 x64

Choose one launcher:

- `Choose Mode.cmd`
- `Open in App Window.cmd`
- `Open in Local Browser.cmd`

The same `Rancho Project Search.exe` powers every mode. No installer and no administrator rights are required.

### macOS Apple Silicon or Intel

Choose the matching archive (`arm64` for Apple Silicon; `x64` for Intel), then use the `.app` or one of the `.command` launchers.

The application is ad-hoc signed but not notarized. On first launch, macOS may require Control-click → **Open**. Keep the `.app`, `.command` files, and `data/` directory in the same extracted folder.

## Rebuilding locally

Create a Python 3.12 virtual environment, then:

```bash
python -m pip install -r requirements-build.txt
```

macOS:

```bash
./scripts/build_macos.sh
```

Windows PowerShell:

```powershell
./scripts/build_windows.ps1
```

Archives are written to `release/`.

## GitHub Actions

Every push to `main` builds and tests:

- Windows x64
- macOS Apple Silicon (`arm64`)
- macOS Intel (`x64`)

Artifacts are retained for 30 days. Pushing a version tag such as `v3.0.0` publishes the three archives on a GitHub Release.

The runner labels follow GitHub's current official runner-image mapping: `windows-latest`, `macos-15`, and `macos-15-intel`.

## Platform notes

- Windows 11 normally includes the Edge WebView2 runtime used by pywebview. Browser mode remains available as a fallback.
- macOS uses the built-in WebKit view.
- These archives are portable but unsigned by a commercial certificate. Windows SmartScreen or macOS Gatekeeper may therefore show a first-run warning.

