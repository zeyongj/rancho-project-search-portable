# Data guide

## Live files

| File | Purpose | Direct editor | Individual upload |
|---|---|---:|---:|
| `project-list.xlsx` | Retained source workbook | No | Via Project List importer |
| `pm.csv` | Active strata projects | Yes | Yes |
| `nlm.csv` | No Longer Managed source projects | Yes | Yes |
| `fa.csv` | Project-to-FA mapping | Yes | Yes |
| `rm.csv` | Residential Management records | Yes | Yes |
| `ap.json` | AP portfolio/include/exclude rules | Yes | Yes |
| `ar.json` | AR portfolio/include/exclude rules | Yes | Yes |

The top-level `data/` directory is the live source when running from this repository. The packaged application uses a `data/` directory beside the portable application.

## Project List import mapping

The importer locates worksheet and column names case-insensitively and tolerates embedded line breaks in headers.

### Active Projects → `pm.csv`

| Workbook column | CSV column |
|---|---|
| `PROJ #` | `PROJ #` |
| `PROJECT NAME` | `PROJECT NAME` |
| `STRATA PLAN` | `STRATA PLAN` |
| `PM` | `PM` |

### NLM → `nlm.csv`

All occupied NLM columns are retained. Blank source headers receive deterministic labels such as `UNNAMED 18`, which makes later CSV editing unambiguous.

The workbook must contain both `Active Projects` and `NLM` worksheets and each must contain `PROJ #` plus `PROJECT NAME`. Invalid workbooks are rejected before any live file is changed.

## Active precedence

The application extracts the first standalone four-digit project number from each project-number cell. It then builds the effective dataset in this order:

1. Load all records from `pm.csv` and mark their project numbers Active.
2. Load `nlm.csv` only for project numbers absent from the Active set.
3. Apply FA, AP, and AR assignments to the resulting project index.

This means an NLM duplicate can never override an Active record. In the supplied July 3 workbook, `5038`, `5049`, and `5131` are duplicates and are therefore Active.

## Project name and address parsing

`PROJECT NAME` cells commonly contain both the display name and address. The parser:

1. Removes empty lines and normalizes whitespace.
2. Keeps leading lines as the project name until it finds the first civic-number line containing a street term (`Road`, `Street`, `Way`, `Avenue`, and common abbreviations).
3. Joins the remaining lines as the searchable address.
4. Adds the separate `CITY` value when it is not already present.

This preserves multi-line names such as “PICASSO GALLERIA CONCORD GARDENS / RENTAL HOUSING UNIT (ASP 2)” while correctly separating `3328 No. 3 Road` as the address.

## Fuzzy search

Advanced Search normalizes case, accents, punctuation, whitespace, and common road abbreviations. Exact substrings are preferred; otherwise each query token may match a candidate token by prefix or one-character edit distance for words of four or more characters.

Examples:

- `Picasso retail` → project name match
- `8531 Capstan Richmnd` → address match despite the missing “o”
- `lms 3174` → `LMS3174`
- partial FA/PM/AP/AR names → matching assignments

Multiple populated fields are combined with AND logic so users can progressively narrow a result set.

## Backups and validation

Before replacing any existing file, the program copies it to:

```text
data/backups/YYYYMMDD-HHMMSS-microseconds/
```

All files involved in a multi-file Excel import are validated and staged before atomic replacement. CSV files must have a recognizable header; AP/AR files must be JSON arrays of objects; uploads are limited to 25 MB.

