/**
 * TYMN Fall Kickoff — Step 3: on-submit automation
 * ---------------------------------------------------------------------------
 * Add this as a NEW FILE in the same Apps Script project as SheetScaffold.gs
 * (it reuses that file's helpers and REVIEW_COLUMNS / *_SHEET constants).
 *
 * On every form submission it:
 *   1. tops up data validation / checkboxes on the new row
 *   2. checks the YouTube link is live (oEmbed) → pre-fills "Link OK?" when safe
 *   3. fuzzy-matches the school → pre-fills "School (canonical)" on a strong hit
 *   4. assigns a reviewer (round-robin, or by category — Config)
 *   5. flags a duplicate video link
 *   6. writes a compact "Auto-check" summary
 *   7. (optional) adds the video to a YouTube playlist
 *   8. emails the submitter a confirmation
 * Plus an onEdit trigger that stamps "Reviewed on" when "Valid?" is set.
 *
 * RUN ONCE:  ensureStep3Setup   (installs triggers, adds columns + Watch Queue,
 * seeds Config). Then do the manual items in review/step3-automation.md.
 */

const AUTO_COLUMNS = [
	{ key: "reviewedOn", header: "Reviewed on" },
	{ key: "auto", header: "Auto-check" },
];

const LINK_OPTIONS = [
	"Yes",
	"No — private",
	"No — dead / wrong link",
	"Can't tell",
];

const STEP3_CONFIG_DEFAULTS = [
	["Assignment mode (round-robin / by-category / off)", "round-robin"],
	["Send confirmation email (yes/no)", "yes"],
	["Confirmation email from-name", "Texas Youth Music Network"],
	["Sync valid videos to a YouTube playlist (yes/no)", "no"],
	["YouTube playlist ID (if syncing)", ""],
];

const FORM_CATEGORIES = [
	"Solo Keyboard",
	"Solo Strings",
	"Solo Wind",
	"Solo Percussion",
	"Solo Misc.",
	"Ensemble",
];

/* ───────────────────────── setup ───────────────────────── */

function ensureStep3Setup() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const rs = getResponsesSheet_(ss);

	ensureConfigDefaults_(ss);
	ensureCategoryReviewerMap_(ss);
	ensureAutoColumns_(rs);
	buildWatchQueue_(ss, rs);
	installTriggers_();

	ss.toast(
		"Step 3 ready — triggers installed, Watch Queue + Auto-check added. " +
			'Now turn OFF the native "send responders a copy" in form settings.',
		"TYMN Review",
		10,
	);
}

/** Located by header name, so these two can be reordered or moved like the rest. */
function ensureAutoColumns_(rs) {
	const headers = headerMap_(rs);
	const map = {};
	let next = rs.getLastColumn() + 1;

	AUTO_COLUMNS.forEach(function (c) {
		const i = headers.indexOf(c.header);
		if (i !== -1) {
			map[c.key] = i + 1;
			return;
		}
		rs.getRange(1, next)
			.setValue(c.header)
			.setBackground("#7f6000")
			.setFontColor("#ffffff")
			.setFontWeight("bold");
		map[c.key] = next;
		next++;
	});

	if (map.auto) rs.setColumnWidth(map.auto, 380);
	return map;
}

function reviewColMap_(rs) {
	const h = headerMap_(rs);
	const at = function (name) {
		return h.indexOf(name) + 1;
	};
	return {
		reviewer: at("Reviewer"),
		school: at("School (canonical)"),
		link: at("Link OK?"),
		valid: at("Valid?"),
		standout: at("Standout?"),
		confirm: at("Standout confirmed?"),
		notes: at("Notes"),
	};
}

/* ─────────────────────── form-submit ───────────────────── */

function onFormSubmitHandler(e) {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const rs = getResponsesSheet_(ss);
	const row = e && e.range ? e.range.getRow() : rs.getLastRow();
	if (row < 2) return;

	const headers = headerMap_(rs);
	const cell = function (colSub, opts) {
		const c = findCol_(headers, colSub, opts);
		return c ? rs.getRange(row, c).getValue() : "";
	};
	const data = {
		name: cell("first and last") || cell("name", { exclude: "canonical" }),
		email: valueAtCol_(rs, row, findEmailCol_(headers)),
		rawSchool:
			cell("full name of school") || cell("school", { exclude: "grade" }),
		category: cell("category"),
		title: cell("title"),
		videoUrl: cell("submission video") || cell("video"),
	};

	const rev = reviewColMap_(rs);
	const auto = ensureAutoColumns_(rs);
	// A row we've already processed always has an Auto-check note. Don't key this
	// off the Reviewer cell — with assignment set to "off" that stays blank, and
	// every student edit would re-run the full pipeline and re-send the
	// confirmation email.
	const isEdit =
		auto.auto && String(rs.getRange(row, auto.auto).getValue()).trim() !== "";

	const link = checkVideoLink_(data.videoUrl);

	// ---- edit of an existing submission: light pass only ----
	if (isEdit) {
		if (rev.link && link.state === "ok")
			rs.getRange(row, rev.link).setValue("Yes");
		if (rev.link && link.state === "missing")
			rs.getRange(row, rev.link).setValue("No — dead / wrong link");
		const prev = String(rs.getRange(row, auto.auto).getValue());
		rs.getRange(row, auto.auto).setValue(
			"EDITED " +
				shortDate_(new Date()) +
				" — recheck. link:" +
				link.state.toUpperCase() +
				(prev ? "  ·  (was: " + prev + ")" : ""),
		);
		return;
	}

	// ---- first submission: full pipeline ----
	topUpRowValidation_(ss, rs, row, rev);

	if (rev.link) {
		if (link.state === "ok") rs.getRange(row, rev.link).setValue("Yes");
		else if (link.state === "missing" || link.state === "unsupported")
			rs.getRange(row, rev.link).setValue("No — dead / wrong link");
		else if (link.state === "private")
			rs.getRange(row, rev.link).setValue("No — private");
		// unknown / empty → leave blank for a human
	}

	const guess = guessSchool_(data.rawSchool, getSchoolsList_(ss));
	if (guess.confident && rev.school)
		rs.getRange(row, rev.school).setValue(guess.name);

	const reviewer = assignReviewer_(ss, data.category);
	if (reviewer && rev.reviewer)
		rs.getRange(row, rev.reviewer).setValue(reviewer);

	const dupeRow = findDuplicateVideo_(rs, link.fingerprint, row, headers);

	const bits = [
		"link:" + link.state.toUpperCase() + (link.host ? " (" + link.host + ")" : ""),
	];
	if (!data.rawSchool) bits.push("no school given");
	else if (guess.confident) bits.push("school→ " + guess.name);
	else
		bits.push(
			'school? "' +
				data.rawSchool +
				'"' +
				(guess.name
					? "  ~maybe " + guess.name
					: "  (no match — add it)"),
		);
	if (dupeRow) bits.push("DUPE video of row " + dupeRow);
	if (link.state === "private")
		bits.push("not shared publicly — ask for a new link");
	if (link.state === "unsupported")
		bits.push("ONLY YouTube or Google Drive links are accepted");
	rs.getRange(row, auto.auto).setValue(bits.join("  ·  "));

	if (
		yes_(
			getCfg_("Sync valid videos to a YouTube playlist (yes/no)", "no"),
		) &&
		link.videoId
	) {
		try {
			addToPlaylist_(link.videoId);
		} catch (err) {
			appendAuto_(
				rs,
				row,
				auto.auto,
				"playlist-sync failed: " + err.message,
			);
		}
	}

	if (
		yes_(getCfg_("Send confirmation email (yes/no)", "yes")) &&
		isEmail_(data.email)
	) {
		try {
			sendConfirmation_(data.email, data);
		} catch (err) {
			appendAuto_(
				rs,
				row,
				auto.auto,
				"confirm-email failed: " + err.message,
			);
		}
	}
}

/* ───────────────────────── on-edit ─────────────────────── */

function onEditHandler(e) {
	try {
		const rs = e.range.getSheet();
		if (
			!isResponsesSheet_(rs) ||
			e.range.getRow() < 2 ||
			e.range.getNumRows() > 1
		)
			return;
		const rev = reviewColMap_(rs);
		if (e.range.getColumn() !== rev.valid) return;
		const stampCol = ensureAutoColumns_(rs).reviewedOn;
		const stamp = rs.getRange(e.range.getRow(), stampCol);
		if (e.value && !stamp.getValue()) stamp.setValue(new Date());
		else if (!e.value) stamp.clearContent();
	} catch (err) {
		/* keep edits fast; never block the user */
	}
}

/* ─────────────────── link / school / assign ────────────── */

/**
 * Only YouTube and Google Drive links are accepted. Anything else is reported
 * as "unsupported" and gets flagged for a re-submission, without a network call.
 *
 * Returned state:
 *   ok           the video is reachable
 *   private      exists but not shared / not public
 *   missing      404, removed, or a malformed id
 *   unsupported  not a YouTube or Drive URL
 *   empty        no link at all
 *   unknown      network error or an unexpected response — a human should look
 */
function checkVideoLink_(url) {
	const out = {
		state: "unknown",
		host: "",
		videoId: extractVideoId_(url), // YouTube only (playlist sync uses this)
		fingerprint: linkFingerprint_(url), // YouTube or Drive (duplicate detection)
		detail: "",
	};
	const s = String(url || "").trim();
	if (!s) {
		out.state = "empty";
		return out;
	}

	if (/youtu\.?be|youtube\.com/i.test(s)) {
		out.host = "youtube";
		try {
			const resp = UrlFetchApp.fetch(
				"https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(s),
				{ muteHttpExceptions: true, followRedirects: true },
			);
			const code = resp.getResponseCode();
			out.detail = "HTTP " + code;
			if (code === 200) out.state = "ok";
			else if (code === 401 || code === 403) out.state = "private";
			else if (code === 404) out.state = "missing";
		} catch (err) {
			out.detail = err.message;
		}
		return out;
	}

	if (/drive\.google\.com|docs\.google\.com/i.test(s)) {
		out.host = "drive";
		const id = extractDriveId_(s);
		if (!id) {
			out.state = "missing";
			out.detail = "no file id in URL";
			return out;
		}
		try {
			const resp = UrlFetchApp.fetch(
				"https://drive.google.com/file/d/" + id + "/view",
				{ muteHttpExceptions: true, followRedirects: false },
			);
			const code = resp.getResponseCode();
			out.detail = "HTTP " + code;
			if (code === 404) {
				out.state = "missing";
			} else if (code === 403) {
				out.state = "private";
			} else if (code === 301 || code === 302 || code === 303) {
				const h = resp.getAllHeaders() || {};
				const loc = String(h.Location || h.location || "");
				out.state = /accounts\.google\.com/i.test(loc) ? "private" : "unknown";
			} else if (code === 200) {
				// A file that isn't shared renders an access-request interstitial.
				const body = String(resp.getContentText()).slice(0, 30000);
				out.state = /Request access|You need access|need permission/i.test(body)
					? "private"
					: "ok";
			}
		} catch (err) {
			out.detail = err.message;
		}
		return out;
	}

	out.state = "unsupported";
	out.detail = "not a YouTube or Google Drive link";
	return out;
}

function extractVideoId_(url) {
	const m = String(url).match(
		/(?:v=|\/live\/|\/shorts\/|\/embed\/|youtu\.be\/)([\w-]{11})/,
	);
	return m ? m[1] : "";
}

function extractDriveId_(url) {
	const s = String(url);
	const m =
		s.match(/\/file\/d\/([\w-]{10,})/) ||
		s.match(/[?&]id=([\w-]{10,})/) ||
		s.match(/\/d\/([\w-]{10,})/);
	return m ? m[1] : "";
}

/** Host-agnostic id used to spot the same video submitted twice. */
function linkFingerprint_(url) {
	return extractVideoId_(url) || extractDriveId_(url) || "";
}

function normalizeSchool_(s) {
	return String(s)
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/\b(senior|junior|jr|sr)\b/g, " ")
		.replace(/\b(high|middle|elementary|intermediate)\b/g, " ")
		.replace(/\bh\.?s\.?\b/g, " ")
		.replace(/\bm\.?s\.?\b/g, " ")
		.replace(/\bschool\b/g, " ")
		.replace(/\bisd\b/g, " ")
		.replace(/[^a-z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function guessSchool_(raw, list) {
	const n = normalizeSchool_(raw);
	if (!n) return { name: "", confident: false, score: 0 };
	let best = { name: "", score: 0 };
	(list || []).forEach(function (name) {
		const m = normalizeSchool_(name);
		let score;
		if (m && m === n) score = 1;
		else {
			const a = n.split(" "),
				b = m.split(" ");
			const bset = {};
			b.forEach(function (w) {
				bset[w] = 1;
			});
			const inter = a.filter(function (w) {
				return bset[w];
			}).length;
			score = inter / Math.max(a.length, b.length, 1);
		}
		if (score > best.score) best = { name: name, score: score };
	});
	return { name: best.name, confident: best.score >= 0.8, score: best.score };
}

function getSchoolsList_(ss) {
	const sh = ss.getSheetByName(SCHOOLS_SHEET);
	if (!sh || sh.getLastRow() < 2) return [];
	return sh
		.getRange(2, 1, sh.getLastRow() - 1, 1)
		.getValues()
		.map(function (r) {
			return String(r[0]).trim();
		})
		.filter(String);
}

function getReviewers_(ss) {
	const sh = ss.getSheetByName(CONFIG_SHEET);
	if (!sh || sh.getLastRow() < 2) return [];
	return sh
		.getRange(2, 1, sh.getLastRow() - 1, 1)
		.getValues()
		.map(function (r) {
			return String(r[0]).trim();
		})
		.filter(String);
}

function assignReviewer_(ss, category) {
	const reviewers = getReviewers_(ss);
	if (!reviewers.length) return "";
	const mode = String(
		getCfg_("Assignment mode (round-robin / by-category / off)", "round-robin"),
	)
		.trim()
		.toLowerCase();

	// "off" / "none" / "manual" / "" → leave the Reviewer cell blank so reviewers
	// claim rows themselves.
	if (
		mode === "" ||
		mode === "off" ||
		mode === "none" ||
		mode === "manual" ||
		mode === "no"
	) {
		return "";
	}

	if (mode.indexOf("categ") !== -1) {
		const map = getCategoryReviewerMap_(ss);
		const hit = Object.keys(map).filter(function (key) {
			return (
				map[key] &&
				String(category).toLowerCase().indexOf(key.toLowerCase()) === 0
			);
		})[0];
		if (hit) return map[hit];
	}

	const props = PropertiesService.getScriptProperties();
	const p =
		(parseInt(props.getProperty("rrPointer") || "0", 10) || 0) %
		reviewers.length;
	props.setProperty("rrPointer", String((p + 1) % reviewers.length));
	return reviewers[p];
}

function findDuplicateVideo_(rs, fingerprint, thisRow, headers) {
	if (!fingerprint || thisRow < 3) return 0;
	const vcol =
		findCol_(headers, "submission video") || findCol_(headers, "video");
	if (!vcol) return 0;
	const vals = rs.getRange(2, vcol, thisRow - 2, 1).getValues();
	for (let i = 0; i < vals.length; i++) {
		if (linkFingerprint_(vals[i][0]) === fingerprint) return i + 2;
	}
	return 0;
}

/* ───────────────── broken-link email (menu) ─────────────── */

const LINK_EMAIL_MARK = "link email sent";

/**
 * Menu: email the participant on the selected row asking for a working link.
 * Shows the full message for approval before anything is sent, and records the
 * send in Auto-check so nobody gets chased twice.
 */
function emailBrokenLink() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const ui = SpreadsheetApp.getUi();
	const rs = getResponsesSheet_(ss);

	if (SpreadsheetApp.getActiveSheet().getSheetName() !== rs.getSheetName()) {
		ui.alert("Open the form-responses tab and select the participant's row first.");
		return;
	}
	const row = rs.getActiveCell().getRow();
	if (row < 2) {
		ui.alert("Select a submission row first (not the header).");
		return;
	}

	const headers = headerMap_(rs);
	const rev = reviewColMap_(rs);
	const auto = ensureAutoColumns_(rs);
	const at = function (sub, opts) {
		const c = findCol_(headers, sub, opts);
		return c ? String(rs.getRange(row, c).getValue()).trim() : "";
	};

	const name = at("full name", { exclude: "school" }) || at("first and last");
	const email = String(
		valueAtCol_(rs, row, findEmailCol_(headers)),
	).trim();
	const videoUrl = at("submission video") || at("video");
	const linkState = rev.link
		? String(rs.getRange(row, rev.link).getValue()).trim()
		: "";
	const autoNote = auto.auto
		? String(rs.getRange(row, auto.auto).getValue())
		: "";

	if (!isEmail_(email)) {
		ui.alert("Row " + row + " has no usable email address — nothing to send to.");
		return;
	}
	if (autoNote.indexOf(LINK_EMAIL_MARK) !== -1) {
		const again = ui.alert(
			"Already contacted",
			"This participant was already emailed about their link.\n\n" +
				autoNote +
				"\n\nSend another one?",
			ui.ButtonSet.YES_NO,
		);
		if (again !== ui.Button.YES) return;
	}

	const reason = brokenLinkReason_(linkState, videoUrl);
	const subject = "Your Fall Kickoff video link needs a quick fix";
	const body = [
		"Hi " + (firstName_(name) || "there") + ",",
		"",
		"Thanks for entering the TYMN Fall Kickoff Challenge. We tried to watch your submission but couldn't open it:",
		"",
		"    " + (videoUrl || "(no link was submitted)"),
		"",
		reason,
		"",
		"What we need:",
		"  • A YouTube link set to Unlisted (not Private), or",
		'  • A Google Drive link shared as "Anyone with the link can view".',
		"",
		"Just reply to this email with the working link and we'll take care of the rest — you don't need to submit the form again. Please send it before the challenge closes on " +
			closeDateText_() +
			" so your entry counts for your school.",
		"",
		"Tip: open your own link in a private/incognito window first. If it plays there, it'll work for us.",
		"",
		"Thanks!",
		"Texas Youth Music Network",
	].join("\n");

	const ok = ui.alert(
		"Send this email?",
		"To: " + email + "  (row " + row + ")\nSubject: " + subject + "\n\n" + body,
		ui.ButtonSet.YES_NO,
	);
	if (ok !== ui.Button.YES) return;

	try {
		MailApp.sendEmail({
			to: email,
			subject: subject,
			body: body,
			htmlBody: plainToHtml_(body),
			name: String(getCfg_("Confirmation email from-name", "Texas Youth Music Network")),
		});
	} catch (err) {
		ui.alert("Could not send: " + err.message);
		return;
	}

	if (auto.auto) {
		appendAuto_(rs, row, auto.auto, LINK_EMAIL_MARK + " " + shortDate_(new Date()));
	}
	ss.toast("Emailed " + email + " about their link.", "TYMN Review", 6);
}

/** The one-line explanation that matches what's actually wrong with the link. */
function brokenLinkReason_(linkState, videoUrl) {
	const s = String(linkState).toLowerCase();
	if (s.indexOf("private") !== -1) {
		return (
			"It looks like the video is set to Private, so only you can see it. " +
			"Unlisted videos are hidden from search but play for anyone with the link — that's what we need."
		);
	}
	if (s.indexOf("dead") !== -1 || s.indexOf("wrong") !== -1) {
		if (videoUrl && !/youtu\.?be|youtube\.com|drive\.google\.com|docs\.google\.com/i.test(videoUrl)) {
			return (
				"That link isn't a YouTube or Google Drive video, and those are the only two we can accept for judging."
			);
		}
		return (
			"The link didn't load — it may have a typo, or the video may have been deleted or moved since you submitted."
		);
	}
	return "The link didn't open for us, so we weren't able to review your performance.";
}

function closeDateText_() {
	const raw = getCfg_("Challenge close date", "2026-09-30");
	const d = raw instanceof Date ? raw : new Date(String(raw));
	if (isNaN(d.getTime())) return String(raw);
	return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMMM d");
}

/* ─────────────────── row validation top-up ─────────────── */

function topUpRowValidation_(ss, rs, row, rev) {
	const schoolsRange = ss.getSheetByName(SCHOOLS_SHEET).getRange("A2:A");
	const reviewersRange = ss.getSheetByName(CONFIG_SHEET).getRange("A2:A");
	REVIEW_COLUMNS.forEach(function (c) {
		const col = rev[c.key];
		if (!col) return;
		const r = rs.getRange(row, col);
		if (c.kind === "schools") {
			r.setDataValidation(
				SpreadsheetApp.newDataValidation()
					.requireValueInRange(schoolsRange, true)
					.setAllowInvalid(false)
					.build(),
			);
		} else if (c.kind === "reviewers") {
			r.setDataValidation(
				SpreadsheetApp.newDataValidation()
					.requireValueInRange(reviewersRange, true)
					.setAllowInvalid(true)
					.build(),
			);
		} else if (c.kind === "list") {
			r.setDataValidation(
				SpreadsheetApp.newDataValidation()
					.requireValueInList(c.options, true)
					.setAllowInvalid(false)
					.build(),
			);
		} else if (c.kind === "checkbox") {
			r.insertCheckboxes();
		}
	});
}

/* ───────────────────── confirmation email ──────────────── */

function sendConfirmation_(to, d) {
	const body = [
		"Hi " + (firstName_(d.name) || "there") + ",",
		"",
		"Thanks for entering the TYMN 2026 Fall Kickoff Challenge — your submission is in.",
		"",
		"What you sent:",
		"  • Category: " + (d.category || "—"),
		"  • Piece: " + (d.title || "—"),
		d.rawSchool
			? "  • School: " + d.rawSchool
			: "  • No school given (not competing for a school ranking)",
		"  • Video: " + d.videoUrl,
		"",
		"What happens next:",
		"  • A reviewer checks your video over the next few days.",
		"  • Your school appears on / gains points on the leaderboard within about a day:",
		"    https://texasyouthmusicnetwork.org/leaderboard",
		"  • Outstanding Performers are announced after the challenge closes on September 30.",
		"",
		"If your link is wrong or set to Private, just reply to this email with the corrected Unlisted link.",
		"",
		"Playing another piece? Submit again — every entry earns your school points.",
		"",
		"— Texas Youth Music Network",
	].join("\n");

	MailApp.sendEmail({
		to: to,
		subject: "We got your Fall Kickoff submission",
		body: body,
		htmlBody: plainToHtml_(body),
		name: String(
			getCfg_(
				"Confirmation email from-name",
				"Texas Youth Music Network",
			),
		),
	});
}

/**
 * Wrap a plain-text body in simple HTML so mail clients reflow it to the
 * reader's window. Gmail renders a text/plain part in a fixed ~78-character
 * column, which is what makes an otherwise fine email look like it's cut off
 * halfway across the screen.
 *
 * Escapes HTML, linkifies URLs, turns "  • " lines into a real list, and keeps
 * paragraph breaks.
 */
function plainToHtml_(plain) {
	const esc = function (s) {
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	};
	const link = function (s) {
		return s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
	};

	const out = [];
	let inList = false;
	String(plain)
		.split("\n")
		.forEach(function (raw) {
			const bullet = raw.match(/^\s*•\s?(.*)$/);
			if (bullet) {
				if (!inList) {
					out.push('<ul style="margin:.4em 0 .8em; padding-left:1.3em;">');
					inList = true;
				}
				out.push("<li>" + link(esc(bullet[1])) + "</li>");
				return;
			}
			if (inList) {
				out.push("</ul>");
				inList = false;
			}
			if (raw.trim() === "") return; // blank line = paragraph break
			// Indented continuation lines (e.g. a bare URL under a bullet).
			const indented = /^\s{2,}\S/.test(raw);
			out.push(
				'<p style="margin:0 0 .8em;' +
					(indented ? "padding-left:1.3em;" : "") +
					'">' +
					link(esc(raw.trim())) +
					"</p>",
			);
		});
	if (inList) out.push("</ul>");

	return (
		'<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;' +
		'line-height:1.55;color:#1a1a1a;max-width:600px;">' +
		out.join("\n") +
		"</div>"
	);
}

/* ───────────────────── YouTube playlist ────────────────── */

function addToPlaylist_(videoId) {
	const pid = String(getCfg_("YouTube playlist ID (if syncing)", "")).trim();
	if (!pid) throw new Error("no playlist ID set in Config");
	// Requires the "YouTube Data API v3" advanced service (Services → +).
	YouTube.PlaylistItems.insert(
		{
			snippet: {
				playlistId: pid,
				resourceId: { kind: "youtube#video", videoId: videoId },
			},
		},
		"snippet",
	);
}

function syncPlaylistFromValidRows() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const rs = getResponsesSheet_(ss);
	const headers = headerMap_(rs);
	const rev = reviewColMap_(rs);
	const vcol =
		findCol_(headers, "submission video") || findCol_(headers, "video");
	const last = rs.getLastRow();
	if (last < 2) return;
	const rows = rs.getRange(2, 1, last - 1, rs.getLastColumn()).getValues();
	let n = 0;
	rows.forEach(function (r) {
		if (String(r[rev.valid - 1]).trim() === "Yes") {
			const id = extractVideoId_(r[vcol - 1]);
			if (id) {
				try {
					addToPlaylist_(id);
					n++;
				} catch (e) {}
			}
		}
	});
	ss.toast(
		"Playlist sync attempted for " +
			n +
			" valid videos (duplicates are skipped by YouTube).",
		"TYMN Review",
		6,
	);
}

/* ─────────────────────── Watch Queue ───────────────────── */

function buildWatchQueue_(ss, rs) {
	let sh = ss.getSheetByName("Watch Queue");
	if (!sh) sh = ss.insertSheet("Watch Queue");
	sh.clear();

	// tymn_* named ranges (created by SheetScaffold.ensureNamedRanges_) keep this
	// formula pointing at the right columns/sheet even after form edits.
	ensureNamedRanges_(ss, rs, reviewColMap_(rs));

	sh.getRange("A1:D1")
		.setValues([
			[
				"Performer",
				"Category",
				"Title",
				"Video link — not yet reviewed, oldest first",
			],
		])
		.setFontWeight("bold")
		.setBackground("#1f3864")
		.setFontColor("#ffffff");
	// Rows where "Valid?" is still blank = not yet judged by a reviewer.
	// (The on-submit trigger fills "Link OK?", so filtering on that would hide
	//  every good submission.)
	sh.getRange("A2").setFormula(
		"=IFERROR(FILTER({tymn_name,tymn_category,tymn_title,tymn_video}, " +
			'tymn_valid="", tymn_ts<>""), ' +
			'"All caught up — every submission has been reviewed.")',
	);
	sh.setFrozenRows(1);
	sh.setColumnWidths(1, 3, 160);
	sh.setColumnWidth(4, 420);
}

/* ─────────────────────── Config helpers ────────────────── */

function ensureConfigDefaults_(ss) {
	const sh = ss.getSheetByName(CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
	const lastRow = Math.max(sh.getLastRow(), 1);
	const labels =
		lastRow >= 2
			? sh
					.getRange(2, 3, lastRow - 1, 1)
					.getValues()
					.map(function (r) {
						return String(r[0]).trim();
					})
			: [];
	let writeRow = 2;
	for (let i = 0; i < labels.length; i++)
		if (labels[i] !== "") writeRow = i + 3;
	STEP3_CONFIG_DEFAULTS.forEach(function (pair) {
		if (labels.indexOf(pair[0]) === -1) {
			sh.getRange(writeRow, 3).setValue(pair[0]);
			sh.getRange(writeRow, 4).setValue(pair[1]);
			writeRow++;
		}
	});
}

function ensureCategoryReviewerMap_(ss) {
	const sh = ss.getSheetByName(CONFIG_SHEET);
	if (String(sh.getRange("F1").getValue()).trim()) return;
	sh.getRange("F1:G1")
		.setValues([["Category (by-category assignment)", "Reviewer"]])
		.setFontWeight("bold")
		.setBackground("#1f3864")
		.setFontColor("#ffffff");
	sh.getRange(2, 6, FORM_CATEGORIES.length, 2).setValues(
		FORM_CATEGORIES.map(function (c) {
			return [c, ""];
		}),
	);
	sh.setColumnWidths(6, 1, 220);
}

function getCategoryReviewerMap_(ss) {
	const sh = ss.getSheetByName(CONFIG_SHEET);
	const last = sh.getLastRow();
	const out = {};
	if (last >= 2) {
		sh.getRange(2, 6, last - 1, 2)
			.getValues()
			.forEach(function (r) {
				if (String(r[0]).trim())
					out[String(r[0]).trim()] = String(r[1]).trim();
			});
	}
	return out;
}

function getCfg_(label, fallback) {
	const sh =
		SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET);
	if (!sh || sh.getLastRow() < 2) return fallback;
	const rows = sh.getRange(2, 3, sh.getLastRow() - 1, 2).getValues();
	for (let i = 0; i < rows.length; i++) {
		if (
			String(rows[i][0]).trim().toLowerCase() ===
			String(label).toLowerCase()
		) {
			return rows[i][1];
		}
	}
	return fallback;
}

/* ─────────────────────── triggers ──────────────────────── */

function installTriggers_() {
	const ss = SpreadsheetApp.getActive();
	const have = ScriptApp.getProjectTriggers().map(function (t) {
		return t.getHandlerFunction();
	});
	if (have.indexOf("onFormSubmitHandler") === -1) {
		ScriptApp.newTrigger("onFormSubmitHandler")
			.forSpreadsheet(ss)
			.onFormSubmit()
			.create();
	}
	if (have.indexOf("onEditHandler") === -1) {
		ScriptApp.newTrigger("onEditHandler")
			.forSpreadsheet(ss)
			.onEdit()
			.create();
	}
}

/* ─────────────────────── small utils ───────────────────── */

function isResponsesSheet_(sheet) {
	try {
		return !!sheet.getFormUrl();
	} catch (e) {
		return sheet.getName() === "Form Responses 1";
	}
}
function findEmailCol_(headers) {
	for (let i = 0; i < headers.length; i++) {
		const h = String(headers[i]).toLowerCase().trim();
		if (h === "email address" || h === "email" || h.indexOf("email:") === 0)
			return i + 1;
	}
	for (let i = 0; i < headers.length; i++) {
		const h = String(headers[i]).toLowerCase().trim();
		if (
			h.indexOf("email") === 0 &&
			h.indexOf("future") === -1 &&
			h.indexOf("receive") === -1
		)
			return i + 1;
	}
	return 0;
}
function valueAtCol_(rs, row, col) {
	return col ? rs.getRange(row, col).getValue() : "";
}
function isEmail_(s) {
	return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s).trim());
}
function firstName_(s) {
	return String(s).trim().split(/\s+/)[0] || "";
}
function yes_(v) {
	return String(v).trim().toLowerCase() === "yes";
}
function shortDate_(d) {
	return Utilities.formatDate(d, Session.getScriptTimeZone(), "MMM d");
}
function appendAuto_(rs, row, autoCol, msg) {
	const c = rs.getRange(row, autoCol);
	c.setValue((c.getValue() ? c.getValue() + "  ·  " : "") + msg);
}
