from __future__ import annotations

import json
import tempfile
import unittest
from importlib.resources import files
from pathlib import Path

from rancho_project_search.data_store import DataStore, DataValidationError, split_project_name_address


class DataStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.store = DataStore(Path(self.temporary.name))
        self.store.initialize()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_default_dataset_loads_all_sources(self) -> None:
        dataset = self.store.dataset()
        self.assertEqual(dataset["summary"]["activeProjects"], 442)
        self.assertEqual(dataset["summary"]["nlmProjects"], 316)
        self.assertGreater(dataset["summary"]["rmProjects"], 1400)
        self.assertTrue(dataset["fa"])
        self.assertTrue(dataset["ap"])
        self.assertTrue(dataset["ar"])

    def test_project_name_and_address_are_split_at_first_street_line(self) -> None:
        raw = (
            "PICASSO GALLERIA RETAIL (REMAINDER)\n"
            "8531-8539 Capstan Way,\n"
            "115-3328 No 3 Road, Commercial Parkade\n"
            "Richmond, B.C."
        )
        name, address = split_project_name_address(raw, "Richmond, B.C.")
        self.assertEqual(name, "PICASSO GALLERIA RETAIL (REMAINDER)")
        self.assertIn("8531-8539 Capstan Way", address)
        self.assertIn("115-3328 No 3 Road", address)

    def test_workbook_import_generates_csv_and_active_projects_win(self) -> None:
        workbook = files("rancho_project_search").joinpath("default_data", "project-list.xlsx").read_bytes()
        report = self.store.import_project_list(workbook)
        self.assertEqual(report["activeProjects"], 439)
        self.assertEqual(report["nlmProjects"], 318)
        self.assertEqual(report["activeWinsOverNlm"], ["5038", "5049", "5131"])

        dataset = self.store.dataset()
        active_keys = {record["proj"] for record in dataset["active"]}
        nlm_keys = {record["proj"] for record in dataset["nlm"]}
        self.assertTrue({"5038", "5049", "5131"}.issubset(active_keys))
        self.assertFalse(active_keys & nlm_keys)
        self.assertEqual(dataset["summary"]["nlmProjects"], 315)

        picasso = next(record for record in dataset["active"] if record["proj"] == "5803")
        self.assertEqual(picasso["projectName"], "PICASSO GALLERIA RETAIL (REMAINDER)")
        self.assertIn("Capstan Way", picasso["address"])
        self.assertIn("No 3 Road", picasso["address"])

    def test_text_edits_are_validated_and_backed_up(self) -> None:
        result = self.store.replace_text("fa.csv", "Project,FA\n5006,TEST USER\n")
        self.assertEqual(result["saved"], "fa.csv")
        self.assertEqual(len(result["backups"]), 1)
        self.assertEqual(self.store.dataset()["fa"], [{"proj": "5006", "fa": "TEST USER"}])
        with self.assertRaises(DataValidationError):
            self.store.replace_text("ap.json", json.dumps({"not": "a list"}))


if __name__ == "__main__":
    unittest.main()

