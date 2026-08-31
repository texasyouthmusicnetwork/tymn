# Step 3 — On-submit automation

Goal: every submission arrives review-ready, and the submitter gets a fast
confirmation.

## Install

1. Same Apps Script project as `SheetScaffold.gs` (Extensions → Apps Script on
   the responses spreadsheet).
2. Add a new file, paste [`OnSubmit.gs`](OnSubmit.gs). Re-paste the updated
   [`SheetScaffold.gs`](SheetScaffold.gs) too (its menu grew).
3. Save. Run **`ensureStep3Setup`** once — grant the auth prompt (Gmail send,
   URL fetch, triggers).
4. Reload the sheet. Do the manual items below.
5. Submit one test response and watch the row fill in.

## What fires on every submission

| # | Action | Where it lands |
|---|---|---|
| 1 | Re-applies dropdowns/checkbox to the new row | review columns |
| 2 | **YouTube link check** (oEmbed): live → pre-fills `Link OK? = Yes`; 404 → `No — dead / wrong link`; 401/403 (private *or* embedding-off) → left blank, flagged | `Link OK?` + `Auto-check` |
| 3 | **School fuzzy-match** against the Schools tab; ≥0.8 token match → pre-fills it, else notes the guess | `School (canonical)` + `Auto-check` |
| 4 | **Reviewer assignment** — round-robin, or by category (Config) | `Reviewer` |
| 5 | **Duplicate video** detection vs. earlier rows | `Auto-check` (`DUPE video of row N`) |
| 6 | Compact status summary | `Auto-check` |
| 7 | *(optional)* add video to a YouTube playlist | your playlist |
| 8 | **Confirmation email** to the submitter (their answers + what-happens-next) | their inbox |

Editing an existing response (allowed since Step 1) runs a **light pass only** —
re-checks the link, marks `Auto-check` as `EDITED … recheck`, and does *not*
reassign or re-email.

**On edit of `Valid?`** → stamps `Reviewed on` (for velocity tracking).

Plus a **Watch Queue** tab: a live formula (not trigger-populated) showing every
submission whose `Valid?` is still blank — performer / category / title / link,
oldest first. A row appears the instant the response lands and drops off the
moment a reviewer sets `Valid?`.

## Manual items

1. **Turn OFF** form Settings → Responses → "Send responders a copy of their
   response". Step 1 turned it on as a stopgap; this script's email replaces it
   (otherwise submitters get two emails and you burn double the send quota).
2. **Fill `Config!A2:A`** with reviewer names (feeds assignment + the dropdown).
3. If assignment = **by-category**: set `Config` → mode to `by-category` and
   fill the `Category → Reviewer` table (cols F:G). Unmapped categories fall
   back to round-robin.
4. **Playlist sync (optional):** Apps Script editor → Services → add
   *YouTube Data API v3*. Create an Unlisted playlist on the account that owns
   this script, put its ID in `Config`, set "Sync valid videos…" to `yes`.
   Menu → *Sync YouTube playlist from valid rows* backfills.

## Sending quota

`MailApp` on a personal Gmail = ~100 confirmation emails/day. Over that, the
send fails and `Auto-check` says so (the row still processes). Google for
Nonprofits / Workspace raises this to ~1,500. If you expect big daily volume,
set "Send confirmation email" to `no` and rely on a digest instead.

## Config summary (all on the `Config` tab)

| Setting | Default |
|---|---|
| Assignment mode | `round-robin` |
| Send confirmation email | `yes` |
| Confirmation email from-name | `Texas Youth Music Network` |
| Sync valid videos to a YouTube playlist | `no` |
| YouTube playlist ID | *(blank)* |

## Next

- Step 4 — reviewer rubric (what "valid" / "standout" mean; the anti-farming
  floor for `Valid?`).
- Step 5 — `Valid?` + school → `leaderboard-data.json`, committed daily.
