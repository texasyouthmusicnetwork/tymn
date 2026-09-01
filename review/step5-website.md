# Step 5 — Connecting the review sheet to the website

Turns `Valid? = Yes` rows into [`leaderboard-data.json`](../leaderboard-data.json)
(the shape [`leaderboard.js`](../leaderboard.js) already reads) and commits it to
the repo so GitHub Pages rebuilds. Runs daily; snapshots `rp → rpLastWeek` once a
week for the ▲▼ arrows.

## Install

1. Paste [`Leaderboard.gs`](Leaderboard.gs) into the same Apps Script project.
   Re-paste [`SheetScaffold.gs`](SheetScaffold.gs) (menu grew). Save.
2. Run **`ensureLeaderboardSetup`** — seeds the Config rows it needs.
3. **GitHub token:** create a *fine-grained personal access token*
   - Resource owner / repository: `texasyouthmusicnetwork/tymn`
   - Repository permissions → **Contents: Read and write**
   - (the token's account must have write access to the repo)
4. Apps Script editor → **Project Settings** (gear) → **Script Properties** →
   add `GITHUB_TOKEN` = the token. It is never written to the sheet.
5. **TYMN Review → Preview leaderboard JSON** — check the `Leaderboard (preview)`
   tab.
6. **TYMN Review → Publish leaderboard now** — commits to `main`. Check the repo
   and, ~1 min later, the live `/leaderboard/` page.
7. **TYMN Review → Install daily publish trigger** (runs ~6am; only commits when
   standings actually changed).

## RP formula (all values on the `Config` tab)

For each canonical school, over its `Valid? = Yes` rows:

```
rp = min(submissions, cap) × RP-per-valid-submission
   + (distinct categories)  × RP-per-unique-category
   + (confirmed standouts)  × RP-per-Outstanding-Performer
   + min(active weeks, 4)   × Consistency-bonus-RP
   + Σ milestone RP for each threshold (5/10/20/40) the school has reached
```

- `submissions`, `uniqueInstruments`, `outstandingPerformers` in the JSON are the
  real counts; only RP uses the capped submission number.
- `city` and `status` come from the **Schools** tab (`status` = `verified` iff
  the Schools-tab Status is `verified`, else `pending`).
- A school appears once it has ≥1 valid submission. Valid rows with no canonical
  school (out-of-state) are counted and reported but not scored.

## Defaults chosen for the open decisions — change in Config to override

| Decision | Default | Config row |
|---|---|---|
| Ensemble counting | one valid row = one submission (reviewers mark duplicate ensemble videos "No") | — (rubric) |
| Non-consenting standouts | still earn the RP; consent only gates *featuring* them | — |
| Small-school cap | **none** | `Max submissions counted for RP (blank = no cap)` |
| Consistency weeks | 7-day buckets from `2026-09-01`, max 4; earlier entries → week 1 | `Consistency week 1 starts (YYYY-MM-DD)` |
| `verified` vs `pending` | from Schools tab Status | Schools tab |
| Snapshot day | Tuesday (aligned to the Sept 1 week boundaries) | `rpLastWeek snapshot weekday` |
| Closing-window guard | no snapshot within 3 days of close | `Skip snapshot within N days of close` |

## rpLastWeek / the ▲▼ arrows

- First publish: every school is `rpLastWeek: null` → shows "New" on the site.
- The daily job snapshots `rp` once a week (on the snapshot weekday, if ≥6 days
  since the last snapshot). From then on the site shows "+N this week".
- Weeks and snapshots are aligned: consistency week 1 starts **Tue Sept 1**, and
  snapshots land on **Tuesdays** — Sept 1, 8, 15, 22 — so "+N this week" on the
  site means exactly one consistency week.
- The Sept 29 snapshot is suppressed by the closing-window guard, so the final
  standings show movement across the whole Sept 22–30 stretch rather than just
  the last two days.
- To set a baseline immediately instead of waiting for the first Monday:
  **TYMN Review → Snapshot standings now**.

## Switching the publish branch

Three ways, all reading the same `GitHub branch` row on the **Config** tab:

- **TYMN Review → Switch publish branch…** — shows the current branch, type a
  new one.
- **Config tab** — the `GitHub branch` cell is a dropdown (`main` / `dev`) that
  also accepts a hand-typed name.
- **`PUBLISH_BRANCHES`** at the top of `Leaderboard.gs` — edit to change what
  the dropdown and the prompt suggest.

`main` is what GitHub Pages serves. Publish to `dev` to stage a standings change
(inspect the JSON in the repo, merge when happy) without touching the live site.
The active branch is named in the publish toast and at the bottom of the
`Leaderboard (preview)` tab, so you always know where a publish landed.

**The daily trigger uses the same setting** — if you leave it on `dev`, the live
leaderboard stops updating. Switch back to `main` when you're done staging.

## Notes

- Commits go straight to the configured branch on GitHub via the API — your
  local checkout is untouched (pull if you want to see them locally).
- The daily job diffs against the current file and **skips the commit when
  nothing changed**, so no empty daily commits.
- Apps Script `UrlFetchApp` daily quota is ~20k calls — a once-a-day publish is
  nowhere near it.
