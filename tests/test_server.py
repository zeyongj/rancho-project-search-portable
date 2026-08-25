from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from rancho_project_search.data_store import DataStore
from rancho_project_search.server import create_server


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.server = create_server(DataStore(Path(self.temporary.name)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def test_health_dataset_and_static_ui(self) -> None:
        with urlopen(f"{self.base_url}/api/health") as response:
            self.assertEqual(json.load(response), {"ok": True})
        with urlopen(f"{self.base_url}/api/dataset") as response:
            dataset = json.load(response)
            self.assertEqual(dataset["summary"]["activeProjects"], 442)
        with urlopen(f"{self.base_url}/") as response:
            html = response.read().decode()
            self.assertIn("Data Workspace", html)
            self.assertNotIn("Admin Login", html)

    def test_write_requires_local_confirmation_header(self) -> None:
        request = Request(
            f"{self.base_url}/api/files/fa.csv",
            method="PUT",
            data=b"Project,FA\n5006,TEST\n",
            headers={"Content-Type": "text/plain"},
        )
        with self.assertRaises(HTTPError) as raised:
            urlopen(request)
        self.assertEqual(raised.exception.code, 403)

        request.add_header("X-Rancho-Request", "1")
        with urlopen(request) as response:
            result = json.load(response)
        self.assertEqual(result["saved"], "fa.csv")


if __name__ == "__main__":
    unittest.main()

