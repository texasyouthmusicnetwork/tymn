# Step 2 — Review surface on the responses spreadsheet

Goal: one place reviewers work, all dropdowns, no typing except notes; progress
visible at a glance; school names canonicalised so the leaderboard doesn't
fragment.

## Run it

1. Open the **responses spreadsheet** (not the form).
2. Extensions → Apps Script. Paste [`SheetScaffold.gs`](SheetScaffold.gs). Save.
3. Run **`setupReviewSheet`** (grant the auth prompt — your own sheet).
4. Reload the sheet. Use the **TYMN Review** menu from then on.

Idempotent — re-run any time. After a big paste of rows or if formatting
drifts: **TYMN Review → Refresh formatting & validation**.

## What it builds

### Tabs

| Tab | What it holds |
|---|---|
| **Schools** | Canonical registry: `School (canonical)` · `City` · `Level` · `Status` (verified/pending) · `Notes/aliases`. The leaderboard uses these exact names. Delete the greyed example row. |
| **Config** | `Reviewers` list (feeds the Reviewer dropdown) + scoring constants used in Step 5 (RP per submission, per category, per Outstanding Performer, close date). |
| **Dashboard** | Live counts: received / reviewed / needs-2nd-look / pending / valid / bad-links / valid-but-unmapped / standouts nominated + confirmed. Plus per-reviewer counts and a per-school valid-submission table. |

### Review columns (appended right of the form columns)

| Column | Input | Meaning |
|---|---|---|
| `Reviewer` | dropdown (Config) | who triaged this row |
| `School (canonical)` | dropdown (Schools) | the leaderboard name — **not** the raw form text |
| `Link OK?` | Yes / No — private / No — dead·wrong / Can't tell | playback check |
| `Valid?` | Yes / No / Needs 2nd look | real performance, right category → **counts for the leaderboard** |
| `Standout?` | checkbox | pass-1 nomination |
| `Standout confirmed?` | Yes / No | pass-2, by a *different* reviewer |
| `Notes` | free text | one line |

### Reordering columns

The review columns are located **by header name**, so you can drag them into any
order you like and everything — dropdowns, row colors, the Dashboard, the
leaderboard — keeps working. Renaming a header is what breaks things: the script
would treat that column as missing and add a fresh one on the right.

One layout rule: keep all review columns **to the right of the form's own
columns**. Everything left of the leftmost review column is treated as form data
and gets edit protection.

### Formatting

- Row tints: **green** = `Valid? = Yes` · **red** = link starts with "No" · **amber** = "Needs 2nd look" · **salmon** = valid but no canonical school picked.
- Header row frozen; columns frozen through the performer's name so it stays on screen while you scroll right.
- Form-response columns are **warning-protected** (you *can* edit, but it asks first) so submission data isn't changed by accident.
- Noise columns (city, director email, consent, opt-in, page-4 survey) are **hidden**. Toggle with **TYMN Review → Hide irrelevant response columns** / **Show all response columns**. The list lives in `HIDE_IF_HEADER_CONTAINS` at the top of `SheetScaffold.gs`.

## Reviewer workflow

**Setup once:** each reviewer makes a filter view — `Data → Filter views → Create new`, filter `Reviewer` = their name (after assignment in Step 3) or filter `Valid?` = blank to see the unreviewed queue. Filter views are per-person and don't disturb others.

**Pass 1 — triage (everyone, ~20s/row):**
1. Open the video (Step 3 will auto-collect these into one YouTube playlist).
2. Set `Link OK?`. If not "Yes", stop — Step 6 re-requests the link.
3. Set `Valid?` — is it a real performance in roughly the right category?
4. Set `School (canonical)`. Not in the list? **TYMN Review → Add selected row's school to Schools tab** (grabs the raw name/city/grade, you confirm the spelling, it adds the row and fills the cell).
5. Tick `Standout?` if it deserves a closer listen.

**Pass 2 — standouts only:** a different reviewer listens to each `Standout? = ✔` row and sets `Standout confirmed?`. These become the Outstanding Performers.

`Valid? = Yes` grouped by `School (canonical)` is exactly what Step 5 turns into
leaderboard points.

## Decisions

| # | Decision | Default |
|---|---|---|
| 1 | Canonical school dropdown rejects free-typed names (forces "add to Schools first") | **On** — this is what keeps the leaderboard clean. The menu helper makes adding fast. |
| 2 | Assignment: round-robin vs. by category | Set in Step 3. Tell me which. |
| 3 | Who does Pass 2 (standout confirmation) | Recommend: anyone *except* the Pass-1 reviewer of that row. |

## Not done yet (later steps)

- Auto reviewer assignment, YouTube playlist, confirmation email, link-liveness check → **Step 3** (`onFormSubmit`).
- Reviewer rubric (what "valid" / "standout" mean, category boundaries) → **Step 4**.
- `Valid?`/school → `leaderboard-data.json` daily → **Step 5**.
