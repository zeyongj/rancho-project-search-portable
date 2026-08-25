from __future__ import annotations

import unittest
from importlib.resources import files


class StaticAssetTests(unittest.TestCase):
    def test_ui_has_no_external_runtime_dependencies(self) -> None:
        web = files("rancho_project_search").joinpath("web")
        for name in ("index.html", "data-workspace.html", "app.js", "workspace.js"):
            content = web.joinpath(name).read_text(encoding="utf-8")
            self.assertNotIn("https://", content, name)
            self.assertNotIn("http://", content, name)

    def test_advanced_search_and_data_editor_controls_exist(self) -> None:
        web = files("rancho_project_search").joinpath("web")
        index = web.joinpath("index.html").read_text(encoding="utf-8")
        workspace = web.joinpath("data-workspace.html").read_text(encoding="utf-8")
        for control in ("filterProjectName", "filterAddress", "filterStrata", "filterFA", "filterPM", "filterAP", "filterAR"):
            self.assertIn(f'id="{control}"', index)
        self.assertIn('id="projectListFile"', workspace)
        self.assertIn('id="dataEditor"', workspace)
        self.assertNotIn("Password", workspace)


if __name__ == "__main__":
    unittest.main()

