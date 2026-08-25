from __future__ import annotations

import json
import mimetypes
import threading
from functools import partial
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files
from pathlib import Path
from urllib.parse import unquote, urlparse

from .data_store import ALL_FILES, MAX_UPLOAD_BYTES, TEXT_FILES, DataStore, DataValidationError


class RanchoHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, server_address: tuple[str, int], store: DataStore):
        super().__init__(server_address, partial(RanchoRequestHandler, store=store))


class RanchoRequestHandler(BaseHTTPRequestHandler):
    server_version = "RanchoProjectSearch/3.0"

    def __init__(self, *args, store: DataStore, **kwargs):
        self.store = store
        super().__init__(*args, **kwargs)

    def log_message(self, format: str, *args) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
        )
        super().end_headers()

    def do_GET(self) -> None:
        if not self._host_allowed():
            self._json_error(HTTPStatus.FORBIDDEN, "Invalid host")
            return
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        try:
            if path == "/api/health":
                self._json({"ok": True})
            elif path == "/api/dataset":
                self._json(self.store.dataset())
            elif path == "/api/files":
                self._json({"dataDirectory": str(self.store.data_dir), "files": self.store.list_files()})
            elif path.startswith("/api/files/"):
                self._serve_data_file(path.removeprefix("/api/files/"))
            else:
                self._serve_static(path)
        except FileNotFoundError:
            self._json_error(HTTPStatus.NOT_FOUND, "File not found")
        except DataValidationError as exc:
            self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Unexpected error: {exc}")

    def do_PUT(self) -> None:
        if not self._write_allowed():
            return
        path = unquote(urlparse(self.path).path)
        if not path.startswith("/api/files/"):
            self._json_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return
        name = path.removeprefix("/api/files/")
        try:
            payload = self._read_body()
            if name in TEXT_FILES and self.headers.get_content_type().startswith("text/"):
                result = self.store.replace_text(name, payload.decode("utf-8-sig"))
            else:
                result = self.store.replace_file(name, payload)
            self._json(result)
        except (UnicodeDecodeError, DataValidationError) as exc:
            self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Unexpected error: {exc}")

    def do_POST(self) -> None:
        if not self._write_allowed():
            return
        path = urlparse(self.path).path
        try:
            if path == "/api/import/project-list":
                self._json(self.store.import_project_list(self._read_body()))
            elif path == "/api/open-data-folder":
                self.store.open_folder()
                self._json({"opened": str(self.store.data_dir)})
            elif path == "/api/shutdown":
                self._json({"stopping": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
            else:
                self._json_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
        except DataValidationError as exc:
            self._json_error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            self._json_error(HTTPStatus.INTERNAL_SERVER_ERROR, f"Unexpected error: {exc}")

    def _read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise DataValidationError("Invalid content length") from exc
        if length <= 0 or length > MAX_UPLOAD_BYTES:
            raise DataValidationError("Upload must be between 1 byte and 25 MB")
        return self.rfile.read(length)

    def _host_allowed(self) -> bool:
        host = self.headers.get("Host", "").split(":", 1)[0].strip("[]").lower()
        return host in {"127.0.0.1", "localhost", "::1"}

    def _write_allowed(self) -> bool:
        if not self._host_allowed():
            self._json_error(HTTPStatus.FORBIDDEN, "Invalid host")
            return False
        if self.headers.get("X-Rancho-Request") != "1":
            self._json_error(HTTPStatus.FORBIDDEN, "Missing local write confirmation header")
            return False
        return True

    def _serve_data_file(self, name: str) -> None:
        if name not in ALL_FILES:
            raise DataValidationError(f"Unsupported data file: {name}")
        payload = self.store.read_bytes(name)
        content_type = "text/plain; charset=utf-8" if name in TEXT_FILES else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        self._bytes(payload, content_type, download_name=name)

    def _serve_static(self, path: str) -> None:
        routes = {
            "/": "index.html",
            "/index.html": "index.html",
            "/data-workspace.html": "data-workspace.html",
        }
        name = routes.get(path, path.lstrip("/"))
        if "/" in name or name.startswith("."):
            self._json_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        resource = files("rancho_project_search").joinpath("web", name)
        try:
            payload = resource.read_bytes()
        except FileNotFoundError:
            self._json_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
            content_type += "; charset=utf-8"
        self._bytes(payload, content_type)

    def _json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        self._bytes(json.dumps(payload, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8", status)

    def _json_error(self, status: HTTPStatus, message: str) -> None:
        self._json({"error": message}, status)

    def _bytes(
        self,
        payload: bytes,
        content_type: str,
        status: HTTPStatus = HTTPStatus.OK,
        *,
        download_name: str | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        if download_name:
            self.send_header("Content-Disposition", f'attachment; filename="{download_name}"')
        self.end_headers()
        self.wfile.write(payload)


def create_server(store: DataStore, host: str = "127.0.0.1", port: int = 0) -> RanchoHTTPServer:
    store.initialize()
    return RanchoHTTPServer((host, port), store)

