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
	["Assignment mode (round-robin / by-category)", "round-robin"],
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

function ensureAutoColumns_(rs) {
	const headers = headerMap_(rs);
	let first = headers.indexOf(AUTO_COLUMNS[0].header) + 1;
	if (!first) {
		first = rs.getLastColumn() + 1;
		rs.getRange(1, first, 1, AUTO_COLUMNS.length)
			.setValues([
				AUTO_COLUMNS.map(function (c) {
					return c.header;
				}),
			])
			.setBackground("#7f6000")
			.setFontColor("#ffffff")
			.setFontWeight("bold");
		rs.setColumnWidth(first + 1, 380);
	}
	const map = {};
	AUTO_COLUMNS.forEach(function (c, i) {
		map[c.key] = first + i;
	});
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
	const isEdit =
		rev.reviewer &&
		String(rs.getRange(row, rev.reviewer).getValue()).trim() !== "";

	const link = checkYouTubeLink_(data.videoUrl);

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
		else if (link.state === "missing")
			rs.getRange(row, rev.link).setValue("No — dead / wrong link");
		// private / unknown / notyt → leave blank for a human
	}

	const guess = guessSchool_(data.rawSchool, getSchoolsList_(ss));
	if (guess.confident && rev.school)
		rs.getRange(row, rev.school).setValue(guess.name);

	const reviewer = assignReviewer_(ss, data.category);
	if (reviewer && rev.reviewer)
		rs.getRange(row, rev.reviewer).setValue(reviewer);

	const dupeRow = findDuplicateVideo_(rs, link.videoId, row, headers);

	const bits = ["link:" + link.state.toUpperCase()];
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
		bits.push("link 401 — private OR embedding-off; open it manually");
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

function checkYouTubeLink_(url) {
	const out = { state: "unknown", videoId: extractVideoId_(url), detail: "" };
	if (!url || !/youtu\.?be|youtube\.com/i.test(String(url))) {
		out.state = "notyt";
		return out;
	}
	try {
		const resp = UrlFetchApp.fetch(
			"https://www.youtube.com/oembed?format=json&url=" +
				encodeURIComponent(String(url).trim()),
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

function extractVideoId_(url) {
	const m = String(url).match(
		/(?:v=|\/live\/|\/shorts\/|\/embed\/|youtu\.be\/)([\w-]{11})/,
	);
	return m ? m[1] : "";
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
		getCfg_("Assignment mode (round-robin / by-category)", "round-robin"),
	).toLowerCase();

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

function findDuplicateVideo_(rs, videoId, thisRow, headers) {
	if (!videoId || thisRow < 3) return 0;
	const vcol =
		findCol_(headers, "submission video") || findCol_(headers, "video");
	if (!vcol) return 0;
	const vals = rs.getRange(2, vcol, thisRow - 2, 1).getValues();
	for (let i = 0; i < vals.length; i++) {
		if (extractVideoId_(vals[i][0]) === videoId) return i + 2;
	}
	return 0;
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
		name: String(
			getCfg_(
				"Confirmation email from-name",
				"Texas Youth Music Network",
			),
		),
	});
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
