/**
 * TYMN Fall Kickoff — Step 1: form settings + confirmation screen
 * ---------------------------------------------------------------------------
 * One-shot, re-runnable setup for the submission form. Applies the settings,
 * the confirmation screen, and the question-level friction fixes from the
 * review-streamlining plan (step 1 of 8).
 *
 * HOW TO RUN
 *   1. Open the form in edit mode.
 *   2. Top-right ⋮  →  "Apps Script"  (a.k.a. Script editor).
 *   3. Paste this file. Save.
 *   4. Run  previewFormSetup   first — it only logs what it *would* do.
 *      (Grant the auth prompt; it's your own form.)
 *   5. Read the log (View → Logs), then run  applyFormSetup .
 *   6. Do the two MANUAL items printed at the end of the log
 *      (see review/step1-form-checklist.md).
 *
 * Safe to re-run. Idempotent where it can be.
 */

const SETUP = {
  // Make "Category" required. Recommended: it feeds the leaderboard's
  // instrument-variety bonus and tells reviewers what they're judging.
  REQUIRE_CATEGORY: true,

  // Make "City and State" required. One short field; useful demographics.
  REQUIRE_CITY_STATE: false,

  // Let a student fix a submission (e.g. a broken link) without re-submitting.
  ALLOW_RESPONSE_EDITS: true,

  // Flip to true ONLY after "Collect email addresses" is on, so you don't end
  // up with two email fields. Deletes the manual "Email:" question. Safe now
  // (zero responses); destructive later.
  REMOVE_MANUAL_EMAIL_QUESTION: false,

  // Reapply a hardened YouTube-link pattern to "Submission Video".
  HARDEN_VIDEO_VALIDATION: true,
};

/* Accepts YouTube (watch, /live, /shorts, /embed, youtu.be) and Google Drive
   file links, with or without scheme / www / m., plus any trailing query.
   These are the only two hosts the review script can verify. */
const YT_PATTERN =
  '(https?://)?((www\\.|m\\.)?(youtube\\.com/(watch\\?v=|live/|shorts/|embed/)|youtu\\.be/)[\\w-]{6,}' +
  '|(drive|docs)\\.google\\.com/.*[\\w-]{10,})';

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

const CONFIRMATION_MESSAGE = [
  'Thanks — your submission is in!',
  '',
  '• You’ll get a confirmation email with a copy of your answers.',
  '• Your school appears on the leaderboard (texasyouthmusicnetwork.org/leaderboard) within about a day.',
  '• Outstanding Performers are announced after the challenge closes on September 30.',
  '',
  'Playing more than one piece? Use “Submit another response” below — every entry earns your school points.',
  '',
  'Questions, or a video link that isn’t working? Email texasyouthmusicnetwork@gmail.com.',
].join('\n');

const APPENDIX_MARKER = 'After you submit:';
const DESCRIPTION_APPENDIX = [
  'After you submit: you’ll get a confirmation email, your school joins the leaderboard within ~24 hours, and Outstanding Performers are announced after September 30.',
  'Please use a personal email address — not your school email.',
].join('\n\n');

// Help text keyed by exact question title.
const HELP_TEXT = {
  'Category':
    'Pick the closest fit — reviewers use this to group submissions, and it feeds your school’s instrument-variety bonus on the leaderboard.',
  'Instrument':
    'Solo: your instrument (e.g. “Violin”).  Ensemble: every performer and their instrument, e.g. “John Doe – Violin, Jane Doe – Piano”.',
  'Submission Video':
    'YouTube or Google Drive only. YouTube: set the video to Unlisted — NOT Private. Google Drive: share it as “Anyone with the link can view”. Tip: open your link in a private/incognito window first to confirm it plays.',
};

const VIDEO_VALIDATION_MESSAGE =
  'Use a YouTube or Google Drive link — those are the only two we can review.';
const DIRECTOR_EMAIL_VALIDATION_MESSAGE =
  'Please enter a valid email address, or leave this blank.';

/* ─────────────────────────────────────────────────────────── */

function previewFormSetup() { run_(false); }
function applyFormSetup() { run_(true); }

function run_(apply) {
  const form = FormApp.getActiveForm();
  const log = [];
  const note = (m) => log.push(m);
  const step = (label, fn) => {
    if (apply) { fn(); note('SET   ' + label); }
    else { note('would set   ' + label); }
  };

  /* ---- form-level settings ---- */
  step('Progress bar = on', () => form.setProgressBar(true));
  step('“Submit another response” link = on', () => form.setShowLinkToRespondAgain(true));
  step('Limit to one response per user = off', () => form.setLimitOneResponsePerUser(false));
  step('Allow response edits = ' + SETUP.ALLOW_RESPONSE_EDITS,
    () => form.setAllowResponseEdits(SETUP.ALLOW_RESPONSE_EDITS));
  step('Confirmation message', () => form.setConfirmationMessage(CONFIRMATION_MESSAGE));

  /* email collection — newer API only; otherwise manual */
  try {
    if (FormApp.EmailCollectionType && FormApp.EmailCollectionType.RESPONDER_INPUT) {
      step('Collect email addresses = Responder input',
        () => form.setEmailCollectionType(FormApp.EmailCollectionType.RESPONDER_INPUT));
    } else {
      note('MANUAL: Settings → Responses → Collect email addresses → “Responder input”.');
    }
  } catch (e) {
    note('MANUAL: set Collect email addresses = “Responder input” (API error: ' + e.message + ').');
  }
  note('MANUAL: Settings → Responses → “Send responders a copy of their response” = Always.');

  /* description appendix (idempotent) */
  const desc = form.getDescription() || '';
  if (desc.indexOf(APPENDIX_MARKER) === -1) {
    step('Append “what happens next” to form description',
      () => form.setDescription((desc ? desc + '\n\n' : '') + DESCRIPTION_APPENDIX));
  } else {
    note('skip   description appendix already present');
  }

  /* ---- per-question ---- */
  const items = form.getItems();
  const byTitle = {};
  items.forEach((it) => { byTitle[it.getTitle().trim()] = it; });
  const findContains = (sub) => {
    sub = sub.toLowerCase();
    return items.filter((it) => it.getTitle().toLowerCase().indexOf(sub) !== -1)[0] || null;
  };

  Object.keys(HELP_TEXT).forEach((title) => {
    const it = byTitle[title];
    if (!it) { note('WARN  question not found for help text: “' + title + '”'); return; }
    step('Help text → “' + title + '”', () => it.setHelpText(HELP_TEXT[title]));
  });

  if (SETUP.REQUIRE_CATEGORY) {
    const it = byTitle['Category'];
    if (it) step('Require “Category”', () => typed_(it).setRequired(true));
    else note('WARN  “Category” not found');
  }

  if (SETUP.REQUIRE_CITY_STATE) {
    const it = findContains('city and state');
    if (it) step('Require “City and State”', () => typed_(it).setRequired(true));
    else note('WARN  “City and State” not found');
  }

  if (SETUP.HARDEN_VIDEO_VALIDATION) {
    const it = byTitle['Submission Video'];
    if (it && it.getType() === FormApp.ItemType.TEXT) {
      step('YouTube-link validation → “Submission Video”', () => {
        it.asTextItem().setValidation(
          FormApp.createTextValidation()
            .setHelpText(VIDEO_VALIDATION_MESSAGE)
            .requireTextContainsPattern(YT_PATTERN)
            .build());
      });
    } else {
      note('WARN  “Submission Video” text question not found');
    }
  }

  {
    const it = findContains("director's email");
    if (it && it.getType() === FormApp.ItemType.TEXT) {
      step('Email validation → Director’s email', () => {
        it.asTextItem().setValidation(
          FormApp.createTextValidation()
            .setHelpText(DIRECTOR_EMAIL_VALIDATION_MESSAGE)
            .requireTextContainsPattern(EMAIL_PATTERN)
            .build());
      });
    } else {
      note('note   Director’s email question not found — skipping validation');
    }
  }

  if (SETUP.REMOVE_MANUAL_EMAIL_QUESTION) {
    const it = findContains('email:');
    if (it) step('DELETE manual “Email:” question', () => form.deleteItem(it));
    else note('note   manual “Email:” question not found (already removed?)');
  } else {
    note('DECISION: once collected email is on, set REMOVE_MANUAL_EMAIL_QUESTION = true and re-run to drop the duplicate email field.');
  }

  Logger.log((apply ? '=== APPLIED ===\n' : '=== PREVIEW (no changes made) ===\n') +
    '- ' + log.join('\n- '));
}

/** Cast a generic Item to its typed form so setRequired() is available. */
function typed_(item) {
  switch (item.getType()) {
    case FormApp.ItemType.MULTIPLE_CHOICE: return item.asMultipleChoiceItem();
    case FormApp.ItemType.TEXT: return item.asTextItem();
    case FormApp.ItemType.PARAGRAPH_TEXT: return item.asParagraphTextItem();
    case FormApp.ItemType.CHECKBOX: return item.asCheckboxItem();
    case FormApp.ItemType.LIST: return item.asListItem();
    case FormApp.ItemType.SCALE: return item.asScaleItem();
    case FormApp.ItemType.DATE: return item.asDateItem();
    default: return item;
  }
}
