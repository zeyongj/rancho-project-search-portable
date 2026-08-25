# Migration notes

## Baseline

- Source repository: `https://github.com/zeyongj/zeyongj.github.io.git`
- Audited source commit: `0f6fb22ed74c4e7f66ed8384b50b55de46ef5ae7`
- The supplied ZIP was byte-equivalent to that checkout (excluding `.git`).
- Workbook: `Project List Final – July 3, 2026.xlsx`

## Workbook and CSV audit

| Source | Rows inspected | Unique project numbers |
|---|---:|---:|
| Workbook `Active Projects` | 444 | 439 |
| Repository `pm.csv` | 447 | 442 |
| Workbook `NLM` | 320 | 318 |
| Repository `nlm.csv` | 318 | 316 |

The repository CSV files were newer than the supplied workbook in a few places, so they remain the default live data. The workbook is also retained as `project-list.xlsx`; importing it intentionally regenerates the two CSV files from its worksheet contents.

Workbook Active/NLM overlaps: `5038`, `5049`, `5131`.

## Logic retained

- Four-digit project number is the primary key.
- Simple, multi-project, strata-plan, RM number, RM street/city/PM/accountant searches remain.
- AP and AR range/include/exclude evaluation order remains.
- FA mapping remains project-number based.
- Rancho logo, colors, cards, tabs, responsive behavior, and result details remain visually consistent with the static site.

## Logic changed

- Local data replaces `raw.githubusercontent.com` and browser-only localStorage.
- Active records are authoritative over NLM duplicates.
- NLM-only records retain available project details rather than displaying only a project number warning.
- Project names and addresses are separated for display and fuzzy filtering.
- Password and session login code was removed.
- All runtime CDN, IP-location, analytics, and external network requests were removed.

## Verification completed

- Python unit/integration tests for import, search data, backups, HTTP API, and write protection.
- Real browser checks at desktop and 390-pixel mobile widths.
- Exact project 5803 search and typo-tolerant address search.
- Search and Data Workspace console error scans.
- Automated accessibility scans with zero violations on both pages.

