# Step 1 — Form settings + confirmation screen

Goal: cut participant friction (drop-off, "did it go through?" emails, broken
links) and make every submission arrive review-ready.

## The live form as it stands (mapped 2026-08-30)

| Page | Section | Questions |
|---|---|---|
| 1 | *(form header)* | **Name** \*req · **Email** \*req (plain text, no validation) · **City & State** |
| 2 | School information — *"leaderboard is Texas schools only… can skip this section"* | **Full name of school** · **School Grade** (Middle / High / Other) · **Director's email** *optional* |
| 3 | Submission | **Category** (6 opts, *not required*) · **Instrument** \*req (help text is about ensembles) · **Submission Video** \*req (✅ has YouTube validation) · **Title and Composer** · **Terms and Permissions** \*req (consent checkbox) · **Opt-out/opt-in** (2 checkboxes: no-feature / wants-emails) |
| 4 | *(OPTIONAL) Final survey* | practice-motivation · enjoyed-competing · how-heard · free-text feedback |

Already good: video-link validation exists; page 4 is clearly optional; consent
statement is thorough.

## Apply with the script

`FormSetup.gs` in this folder does most of step 1 in one run.

1. Form (edit mode) → ⋮ → **Apps Script**. Paste `FormSetup.gs`, Save.
2. Run **`previewFormSetup`**, read View → Logs.
3. Run **`applyFormSetup`**.

It sets: confirmation message · progress bar · "submit another response" on ·
one-response-per-user off · response editing on · collected email (if the API
allows) · appends "what happens next" to the description · Category required ·
better help text on Category / Instrument / Submission Video · hardened YouTube
validation · email validation on Director's email.

## Two things the script can't do — do these by hand

1. **Settings → Responses → Collect email addresses → "Responder input"**
   (only if the log said `MANUAL`). No Google sign-in wall; Google still
   format-checks the address.
2. **Settings → Responses → "Send responders a copy of their response" → Always.**
   This is the interim confirmation email until the richer autoresponder in
   step 3.

Then: enabled collected email means the manual **Email** question is now a
duplicate. Set `REMOVE_MANUAL_EMAIL_QUESTION = true` in the script and re-run to
delete it. Move its "don't use school email" note — the script already added it
to the form description.

## Decisions for you

| # | Decision | Recommendation |
|---|---|---|
| 1 | Require **Category**? | **Yes** — feeds leaderboard + reviewer grouping. (`REQUIRE_CATEGORY`, default on.) |
| 2 | Drop the manual **Email** question for collected email? | **Yes**, after enabling collected email. One less field, guaranteed valid, powers receipts. |
| 3 | Allow **response editing**? | **Yes** — a student can fix a broken link without a duplicate row. (Step 3 automation will flag rows edited after review.) |
| 4 | Require **City & State**? | Optional. Off by default; flip `REQUIRE_CITY_STATE` if you want it. |

## Confirmation screen copy (what the script sets)

> Thanks — your submission is in!
>
> • You'll get a confirmation email with a copy of your answers.
> • Your school appears on the leaderboard (texasyouthmusicnetwork.org/leaderboard) within about a day.
> • Outstanding Performers are announced after the challenge closes on September 30.
>
> Playing more than one piece? Use "Submit another response" below — every entry earns your school points.
>
> Questions, or a video link that isn't working? Email texasyouthmusicnetwork@gmail.com.

## Not changed (deliberately)

- **"Instrument" question** stays one field doing double duty (solo instrument /
  ensemble roster) — Category already tells reviewers which it is, and the new
  help text makes the format explicit. Splitting it would add a question.
- **Page 2 "skip this section"** wording stays — the "no school" state is valid
  (non-Texas / not competing for a school). Step 2's aggregation handles blank
  school as "not competing."
- Question order — untouched; you finalized it.
