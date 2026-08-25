#!/bin/zsh
set -e
script_dir="$(cd "$(dirname "$0")" && pwd)"
exec "$script_dir/Rancho Project Search.app/Contents/MacOS/Rancho Project Search" --mode browser

