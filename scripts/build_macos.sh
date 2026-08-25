#!/bin/zsh
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

python -m PyInstaller --clean --noconfirm rancho_portable.spec

smoke_dir="$(mktemp -d)"
trap 'rm -rf "$smoke_dir"' EXIT
"$project_dir/dist/Rancho Project Search.app/Contents/MacOS/Rancho Project Search" --smoke-test --data-dir "$smoke_dir"

release_dir="$project_dir/release/Rancho Project Search macOS"
if [[ -d "$release_dir" ]]; then
  rm -rf "$release_dir"
fi
mkdir -p "$release_dir"
cp -R "$project_dir/dist/Rancho Project Search.app" "$release_dir/"
cp -R "$project_dir/data" "$release_dir/data"
cp "$project_dir"/packaging/macos/*.command "$release_dir/"
chmod +x "$release_dir"/*.command

codesign --force --deep --sign - "$release_dir/Rancho Project Search.app"

architecture="$(uname -m)"
archive="$project_dir/release/Rancho-Project-Search-macOS-$architecture.zip"
if [[ -f "$archive" ]]; then
  rm "$archive"
fi
ditto -c -k --sequesterRsrc --keepParent "$release_dir" "$archive"
echo "$archive"
