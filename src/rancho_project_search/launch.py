from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import webbrowser
from pathlib import Path

from .data_store import DataStore
from .server import create_server


def portable_root() -> Path:
    configured = os.environ.get("RANCHO_DATA_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    if getattr(sys, "frozen", False):
        executable = Path(sys.executable).resolve()
        if sys.platform == "darwin" and ".app" in str(executable):
            app_index = next(index for index, parent in enumerate(executable.parents) if parent.suffix == ".app")
            app_path = executable.parents[app_index]
            return app_path.parent / "data"
        return executable.parent / "data"
    return Path(__file__).resolve().parents[2] / "data"


def choose_mode() -> str:
    try:
        import tkinter as tk
        from tkinter import ttk
    except Exception:
        return "browser"

    selected = {"mode": ""}
    root = tk.Tk()
    root.title("Rancho Project Search")
    root.geometry("470x260")
    root.resizable(False, False)

    frame = ttk.Frame(root, padding=28)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Rancho Project Search", font=("Arial", 18, "bold")).pack(pady=(0, 8))
    ttk.Label(frame, text="Choose how you want to open the local application.", wraplength=390).pack(pady=(0, 22))

    def pick(mode: str) -> None:
        selected["mode"] = mode
        root.destroy()

    ttk.Button(frame, text="Open as App Window", command=lambda: pick("window")).pack(fill="x", pady=5)
    ttk.Button(frame, text="Open in Local Browser", command=lambda: pick("browser")).pack(fill="x", pady=5)
    ttk.Button(frame, text="Cancel", command=root.destroy).pack(pady=(14, 0))
    root.mainloop()
    return selected["mode"]


def _serve_in_thread(server) -> threading.Thread:
    thread = threading.Thread(target=server.serve_forever, name="rancho-local-server", daemon=True)
    thread.start()
    return thread


def run_window(url: str, server) -> None:
    try:
        import webview
    except ImportError:
        webbrowser.open(url)
        run_browser_controller(url, server, fallback_message=True)
        return
    webview.create_window("Rancho Project Search", url, width=1320, height=880, min_size=(980, 680))
    try:
        webview.start()
    finally:
        server.shutdown()


def run_browser_controller(url: str, server, *, fallback_message: bool = False) -> None:
    webbrowser.open(url)
    if not getattr(sys, "frozen", False) and sys.stdout and sys.stdout.isatty():
        if fallback_message:
            print("Desktop WebView is unavailable; opened the local browser instead.")
        print(f"Rancho Project Search is running at {url}")
        print("Press Ctrl+C to stop it.")
        try:
            while True:
                time.sleep(0.5)
        except KeyboardInterrupt:
            server.shutdown()
        return

    try:
        import tkinter as tk
        from tkinter import ttk
    except Exception:
        while True:
            time.sleep(1)

    root = tk.Tk()
    root.title("Rancho Project Search — Browser Mode")
    root.geometry("440x210")
    root.resizable(False, False)
    frame = ttk.Frame(root, padding=24)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Rancho Project Search is running", font=("Arial", 15, "bold")).pack(pady=(0, 10))
    ttk.Label(frame, text="Keep this window open while using the local browser.", wraplength=360).pack()
    ttk.Button(frame, text="Open Browser Again", command=lambda: webbrowser.open(url)).pack(fill="x", pady=(18, 6))

    def stop() -> None:
        server.shutdown()
        root.destroy()

    ttk.Button(frame, text="Stop Application", command=stop).pack(fill="x")
    root.protocol("WM_DELETE_WINDOW", stop)
    root.mainloop()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Rancho Project Search local application")
    parser.add_argument("--mode", choices=("choose", "window", "browser"), default="choose")
    parser.add_argument("--data-dir", type=Path, help="Use a custom writable data folder")
    parser.add_argument("--port", type=int, default=0, help="Local port (0 selects a free port)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    mode = choose_mode() if args.mode == "choose" else args.mode
    if not mode:
        return 0
    data_dir = args.data_dir.expanduser().resolve() if args.data_dir else portable_root()
    server = create_server(DataStore(data_dir), port=args.port)
    _serve_in_thread(server)
    host, port = server.server_address[:2]
    url = f"http://{host}:{port}/"
    if mode == "window":
        run_window(url, server)
    else:
        run_browser_controller(url, server)
    return 0

