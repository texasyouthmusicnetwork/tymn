/**
 * TYMN Fall Kickoff — Step 2: review surface on the responses spreadsheet
 * ---------------------------------------------------------------------------
 * Builds everything reviewers touch:
 *   • Schools tab      — canonical school registry (name, city, level, status)
 *   • Config tab       — reviewer list + scoring constants (used in step 5)
 *   • Review columns   — appended to the right of the form's columns, all
 *                        dropdowns/checkbox except Notes
 *   • Data validation  — dropdowns wired to Schools / Config
 *   • Conditional formatting — green = valid, red = bad link, amber = 2nd look
 *   • Dashboard tab    — live counts: received / reviewed / pending / broken /
 *                        valid / standouts / unmapped, plus per-school table
 *   • Freeze + warning-protection on the form columns, noise columns hidden
 *
 * HOW TO RUN
 *   1. Open the RESPONSES spreadsheet (not the form).
 *   2. Extensions → Apps Script. Paste this file. Save.
 *   3. Run  setupReviewSheet  once (grant the auth prompt).
 *   4. Reload the sheet → use the "TYMN Review" menu afterwards.
 *
 * Idempotent: re-running won't duplicate columns or tabs. If you import a big
 * batch of rows or formatting drifts, run "Refresh formatting" from the menu.
 */

const REVIEW_COLUMNS = [
	{ key: "reviewer", header: "Reviewer", kind: "reviewers" },
	{ key: "school", header: "School (canonical)", kind: "schools" },
	{
		key: "link",
		header: "Link OK?",
		kind: "list",
		options: [
			"Yes",
			"No — private",
			"No — dead / wrong link",
			"Can't tell",
		],
	},
	{
		key: "valid",
		header: "Valid?",
		kind: "list",
		options: ["Yes", "No", "Needs 2nd look"],
	},
	{ key: "standout", header: "Standout?", kind: "checkbox" },
	{
		key: "confirm",
		header: "Standout confirmed?",
		kind: "list",
		options: ["Yes", "No"],
	},
	{ key: "notes", header: "Notes", kind: "text" },
];

const SCHOOLS_SHEET = "Schools";
const CONFIG_SHEET = "Config";
const DASHBOARD_SHEET = "Dashboard";

// Response columns hidden during review (matched by header substring, lowercase).
const HIDE_IF_HEADER_CONTAINS = [
	"city and state",
	"director's email",
	"terms and permissions",
	"opt-out",
	"opt-in",
	"how did you hear",
	"feedback or thoughts",
	"motivate you to practice",
	"enjoy competing",
	"rules & consent",
	"mailing list",
];

/* ─────────────────────────── menu ─────────────────────────── */

function onOpen() {
	const ui = SpreadsheetApp.getUi();
	const menu = ui
		.createMenu("TYMN Review")

		.addItem(
			"Add selected row’s school to Schools tab",
			"addSchoolFromSelectedRow",
		)
		.addItem("Hide irrelevant response columns", "hideIrrelevantColumns")
		.addItem("Show all response columns", "showAllResponseColumns")
		.addSeparator()
		.addItem(
			"(DON'T TOUCH) Set up / repair review sheet",
			"setupReviewSheet",
		)
		.addItem(
			"(DON'T TOUCH) Set up automation (triggers, Watch Queue)",
			"ensureStep3Setup",
		)
		.addItem(
			"(DON'T TOUCH) Refresh formatting & validation",
			"refreshReviewFormatting",
		);

	// Step 3 items — present only if OnSubmit.gs is in the project.
	// if (typeof ensureStep3Setup === "function") {
	// 	menu.addSeparator().addItem(
	// 		"Sync YouTube playlist from valid rows",
	// 		"syncPlaylistFromValidRows",
	// 	);
	// }
	menu.addToUi();
}

/* ─────────────────────────── setup ────────────────────────── */

function setupReviewSheet() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const rs = getResponsesSheet_(ss);

	ensureSchoolsSheet_(ss);
	ensureConfigSheet_(ss);
	ensureRubricSheet_(ss);
	const cols = ensureReviewColumns_(rs);
	applyValidation_(ss, rs, cols);
	applyConditionalFormatting_(rs, cols);
	hideNoiseColumns_(rs);
	protectAndFreeze_(rs, cols);
	buildDashboard_(ss, rs, cols);

	ss.toast(
		'Review sheet ready. See the Dashboard tab and the "TYMN Review" menu.',
		"TYMN Review",
		8,
	);
}

function refreshReviewFormatting() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const rs = getResponsesSheet_(ss);
	const cols = ensureReviewColumns_(rs);
	applyValidation_(ss, rs, cols);
	applyConditionalFormatting_(rs, cols);
	protectAndFreeze_(rs, cols);
	ensureNamedRanges_(ss, rs, cols);
	ss.toast("Formatting, validation, and dashboard ranges refreshed.", "TYMN Review", 5);
}

/* ─────────────────── responses sheet lookup ───────────────── */

function getResponsesSheet_(ss) {
	const linked = ss.getSheets().filter(function (s) {
		try {
			return !!s.getFormUrl();
		} catch (e) {
			return false;
		}
	});
	if (linked.length) return linked[0];
	const byName = ss.getSheetByName("Form Responses 1");
	if (byName) return byName;
	throw new Error(
		"Could not find the form-responses sheet. Link the form to this spreadsheet first.",
	);
}

function headerMap_(rs) {
	const headers = rs
		.getRange(1, 1, 1, Math.max(rs.getLastColumn(), 1))
		.getValues()[0];
	return headers.map(function (h) {
		return String(h).trim();
	});
}

/** 1-based column index of the first header containing `sub` (case-insensitive). */
function findCol_(headers, sub, opts) {
	sub = sub.toLowerCase();
	const exclude = opts && opts.exclude ? opts.exclude.toLowerCase() : null;
	for (let i = 0; i < headers.length; i++) {
		const h = headers[i].toLowerCase();
		if (h.indexOf(sub) !== -1 && (!exclude || h.indexOf(exclude) === -1))
			return i + 1;
	}
	return 0;
}

/* ─────────────────────── review columns ───────────────────── */

function ensureReviewColumns_(rs) {
	const headers = headerMap_(rs);
	let firstReviewCol = headers.indexOf(REVIEW_COLUMNS[0].header) + 1;

	if (!firstReviewCol) {
		firstReviewCol = rs.getLastColumn() + 1;
		const row = REVIEW_COLUMNS.map(function (c) {
			return c.header;
		});
		rs.getRange(1, firstReviewCol, 1, row.length).setValues([row]);
	}

	const map = {};
	REVIEW_COLUMNS.forEach(function (c, i) {
		map[c.key] = firstReviewCol + i;
	});

	// header styling
	const hdr = rs.getRange(1, firstReviewCol, 1, REVIEW_COLUMNS.length);
	hdr.setBackground("#1f3864")
		.setFontColor("#ffffff")
		.setFontWeight("bold")
		.setWrap(true)
		.setHorizontalAlignment("center");
	rs.getRange(1, firstReviewCol, rs.getMaxRows(), 1).setBorder(
		null,
		true,
		null,
		null,
		null,
		null,
		"#1f3864",
		SpreadsheetApp.BorderStyle.SOLID_THICK,
	);
	rs.setColumnWidth(map.notes, 320);

	map._first = firstReviewCol;
	map._last = firstReviewCol + REVIEW_COLUMNS.length - 1;
	map._headers = headerMap_(rs);
	return map;
}

/* ───────────────────────── validation ─────────────────────── */

function applyValidation_(ss, rs, cols) {
	const a1 = function (c) {
		return colLetter_(c) + "2:" + colLetter_(c);
	};

	const schoolsRange = ss.getSheetByName(SCHOOLS_SHEET).getRange("A2:A");
	rs.getRange(a1(cols.school)).setDataValidation(
		SpreadsheetApp.newDataValidation()
			.requireValueInRange(schoolsRange, true)
			.setAllowInvalid(false)
			.setHelpText(
				'Pick a canonical school. Not listed? TYMN Review menu → "Add selected row’s school to Schools tab".',
			)
			.build(),
	);

	const reviewersRange = ss.getSheetByName(CONFIG_SHEET).getRange("A2:A");
	rs.getRange(a1(cols.reviewer)).setDataValidation(
		SpreadsheetApp.newDataValidation()
			.requireValueInRange(reviewersRange, true)
			.setAllowInvalid(true)
			.build(),
	);

	REVIEW_COLUMNS.forEach(function (c) {
		if (c.kind === "list") {
			rs.getRange(a1(cols[c.key])).setDataValidation(
				SpreadsheetApp.newDataValidation()
					.requireValueInList(c.options, true)
					.setAllowInvalid(false)
					.build(),
			);
		} else if (c.kind === "checkbox") {
			rs.getRange(a1(cols[c.key])).insertCheckboxes();
		}
	});
}

/* ────────────────── conditional formatting ────────────────── */

function applyConditionalFormatting_(rs, cols) {
	const lastCol = cols._last;
	const rows = Math.max(rs.getMaxRows() - 1, 1);
	const fullRange = rs.getRange(2, 1, rows, lastCol);
	const L = function (c) {
		return "$" + colLetter_(c) + "2";
	};

	const keep = (rs.getConditionalFormatRules() || []).filter(function (r) {
		// drop our previous rules (identified by touching the review columns) so re-runs don't stack
		return !r.getRanges().some(function (rg) {
			return (
				rg.getColumn() <= lastCol && rg.getLastColumn() >= cols._first
			);
		});
	});

	const mk = function (formula, bg) {
		return SpreadsheetApp.newConditionalFormatRule()
			.whenFormulaSatisfied(formula)
			.setBackground(bg)
			.setRanges([fullRange])
			.build();
	};

	const rules = keep.concat([
		mk("=REGEXMATCH(" + L(cols.link) + ',"^No")', "#f4cccc"), // bad link — red
		mk("=" + L(cols.valid) + '="Needs 2nd look"', "#fce8b2"), // 2nd look — amber
		mk("=" + L(cols.valid) + '="Yes"', "#d9ead3"), // valid — green
		mk(
			"=AND(" + L(cols.valid) + '="Yes",' + L(cols.school) + '="")',
			"#e6b8af",
		), // valid but unmapped
	]);
	rs.setConditionalFormatRules(rules);
}

/* ──────────────────── hide / freeze / protect ─────────────── */

function hideNoiseColumns_(rs) {
	let n = 0;
	headerMap_(rs).forEach(function (h, i) {
		const lc = h.toLowerCase();
		if (
			HIDE_IF_HEADER_CONTAINS.some(function (s) {
				return lc.indexOf(s) !== -1;
			})
		) {
			rs.hideColumns(i + 1);
			n++;
		}
	});
	return n;
}

function showAllResponseColumns() {
	const rs = getResponsesSheet_(SpreadsheetApp.getActiveSpreadsheet());
	rs.showColumns(1, rs.getLastColumn());
}

function hideIrrelevantColumns() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const n = hideNoiseColumns_(getResponsesSheet_(ss));
}

function protectAndFreeze_(rs, cols) {
	rs.setFrozenRows(1);
	const headers = headerMap_(rs);
	const nameCol =
		findCol_(headers, "first and last") ||
		findCol_(headers, "name", { exclude: "canonical" }) ||
		2;
	rs.setFrozenColumns(nameCol);

	const formLastCol = cols._first - 1;
	const dataRange = rs.getRange(1, 1, rs.getMaxRows(), formLastCol);
	const existing = rs
		.getProtections(SpreadsheetApp.ProtectionType.RANGE)
		.filter(function (p) {
			return p.getDescription() === "TYMN: form responses (do not edit)";
		});
	existing.forEach(function (p) {
		p.remove();
	});
	const prot = dataRange
		.protect()
		.setDescription("TYMN: form responses (do not edit)");
	prot.setWarningOnly(true);
}

/* ─────────────────────── Schools tab ──────────────────────── */

function ensureSchoolsSheet_(ss) {
	let sh = ss.getSheetByName(SCHOOLS_SHEET);
	if (!sh) sh = ss.insertSheet(SCHOOLS_SHEET);
	if (sh.getLastRow() === 0) {
		sh.getRange(1, 1, 1, 5)
			.setValues([
				[
					"School (canonical)",
					"City",
					"Level",
					"Status",
					"Notes / aliases",
				],
			])
			.setFontWeight("bold")
			.setBackground("#1f3864")
			.setFontColor("#ffffff");
		sh.getRange(2, 1, 1, 5)
			.setValues([
				[
					"Northwest High School",
					"Justin",
					"High School",
					"pending",
					"example row — delete or edit",
				],
			])
			.setFontColor("#999999");
		sh.getRange("C2:C").setDataValidation(
			SpreadsheetApp.newDataValidation()
				.requireValueInList(
					["Middle School", "High School", "Other"],
					true,
				)
				.build(),
		);
		sh.getRange("D2:D").setDataValidation(
			SpreadsheetApp.newDataValidation()
				.requireValueInList(["verified", "pending"], true)
				.build(),
		);
		sh.setFrozenRows(1);
		sh.setColumnWidths(1, 1, 260);
		sh.setColumnWidths(5, 1, 320);
	}
	return sh;
}

function addSchoolFromSelectedRow() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const rs = getResponsesSheet_(ss);
	const cell = rs.getActiveCell();
	const ui = SpreadsheetApp.getUi();
	if (
		rs.getSheetName() !== SpreadsheetApp.getActiveSheet().getSheetName() ||
		cell.getRow() < 2
	) {
		ui.alert("Select a submission row on the responses sheet first.");
		return;
	}
	const row = cell.getRow();
	const headers = headerMap_(rs);
	const rawSchool = valAt_(
		rs,
		row,
		findCol_(headers, "full name of school") ||
			findCol_(headers, "school", { exclude: "grade" }),
	);
	const grade = valAt_(
		rs,
		row,
		findCol_(headers, "school grade") || findCol_(headers, "grade"),
	);
	const city = valAt_(rs, row, findCol_(headers, "city and state"));

	const resp = ui.prompt(
		"Add school to Schools tab",
		"Canonical name to add (edit to match your leaderboard spelling):",
		ui.ButtonSet.OK_CANCEL,
	);
	if (resp.getSelectedButton() !== ui.Button.OK) return;
	const name = resp.getResponseText().trim() || String(rawSchool).trim();
	if (!name) {
		ui.alert("No name given.");
		return;
	}

	const sh = ss.getSheetByName(SCHOOLS_SHEET);
	const existing = sh
		.getRange("A2:A")
		.getValues()
		.map(function (r) {
			return String(r[0]).trim().toLowerCase();
		});
	if (existing.indexOf(name.toLowerCase()) === -1) {
		sh.appendRow([
			name,
			String(city).replace(/,.*/, "").trim(),
			gradeToLevel_(grade),
			"pending",
			rawSchool && String(rawSchool).trim() !== name
				? "submitted as: " + rawSchool
				: "",
		]);
	}
	const cols = ensureReviewColumns_(rs);
	rs.getRange(row, cols.school).setValue(name);
	ss.toast(
		'Added "' + name + '" and set it on row ' + row + ".",
		"TYMN Review",
		5,
	);
}

function gradeToLevel_(g) {
	g = String(g).toLowerCase();
	if (g.indexOf("middle") !== -1) return "Middle School";
	if (g.indexOf("high") !== -1) return "High School";
	return g ? "Other" : "";
}

/* ─────────────────────── Config tab ───────────────────────── */

function ensureConfigSheet_(ss) {
	let sh = ss.getSheetByName(CONFIG_SHEET);
	if (!sh) sh = ss.insertSheet(CONFIG_SHEET);
	if (sh.getLastRow() === 0) {
		sh.getRange("A1")
			.setValue("Reviewers (one per row — feeds the Reviewer dropdown)")
			.setFontWeight("bold")
			.setBackground("#1f3864")
			.setFontColor("#ffffff");
		sh.getRange("A2:A4").setValues([["Clint Lee"], ["Shaoyu Wang"], [""]]);

		sh.getRange("C1:D1")
			.setValues([["Scoring setting (used in Step 5)", "Value"]])
			.setFontWeight("bold")
			.setBackground("#1f3864")
			.setFontColor("#ffffff");
		sh.getRange("C2:D6").setValues([
			["RP per valid submission", 100],
			["RP per unique category (per school)", 25],
			["RP per Outstanding Performer", 150],
			["Consistency bonus RP (submissions on 3+ distinct days)", 50],
			["Challenge close date", "2026-09-30"],
		]);
		sh.setColumnWidths(1, 1, 240);
		sh.setColumnWidths(3, 1, 320);
		sh.setFrozenRows(1);
	}
	return sh;
}

/* ─────────────────────── Rubric tab ───────────────────────── */

function ensureRubricSheet_(ss) {
	let sh = ss.getSheetByName("Rubric");
	if (sh) return sh; // never overwrite — organizers edit this
	sh = ss.insertSheet("Rubric");
	const lines = [
		["Reviewer cheat-sheet — full version: review/REVIEWER-RUBRIC.md"],
		[""],
		["Valid  = a genuine student performance, honestly represented. NOT \"good.\""],
		["Standout = you would feature it on TYMN's site / socials."],
		["Participation and effort beat talent. A shaky beginner piece is Valid."],
		[""],
		["VALID? = Yes when ALL hold:"],
		["  • real performance by the submitter / their named ensemble"],
		["  • ~1 min+ of actual playing; a complete piece, movement, etude, or big section"],
		["  • live performance of the person on screen (no pro recordings, reposts, lip-sync)"],
		["  • you can see & hear them play"],
		["VALID? = No:  not music / not the submitter / too short / duplicate / faked"],
		["VALID? = Needs 2nd look:  borderline length or effort, unsure it's them, maybe-duplicate"],
		["When unsure → Needs 2nd look. Never guess."],
		[""],
		["FARMING (100 RP each):"],
		["  • same student, different pieces → all valid"],
		["  • same student, same piece again → first valid, rest No (\"duplicate\")"],
		["  • one ensemble video sent by each member → counts ONCE (rest No)"],
		["  • burst of throwaway clips from one school → each No, tell an organizer"],
		[""],
		["STANDOUT? (Pass 1): nominate generously for any level — polish, musicality,"],
		["  expression, hard passage handled, or a beginner whose serious work shows."],
		["STANDOUT CONFIRMED? (Pass 2, a DIFFERENT reviewer): watch the whole video;"],
		["  Yes only if featured-quality. Spread across categories & schools when close."],
		["  CHECK the Opt-out/opt-in column before confirming a feature."],
		[""],
		["CATEGORIES:"],
		["  Keyboard: piano, organ, harpsichord   |   Strings: bowed + plucked incl. guitar, harp, uke"],
		["  Wind: all woodwinds + all brass       |   Percussion: snare, mallets, timpani, drum set"],
		["  Misc.: voice, non-Western, synth       |   Ensemble: 2+ independent parts"],
		["  Soloist + accompanist = SOLO in the soloist's category."],
		["  Wrong category → fix it, don't reject."],
	];
	sh.getRange(1, 1, lines.length, 1).setValues(lines);
	sh.getRange("A1").setFontWeight("bold");
	sh.getRange("A3:A4").setFontWeight("bold");
	sh.setColumnWidth(1, 720);
	sh.setFrozenRows(1);
	return sh;
}

/* ─────────────────────── Dashboard ────────────────────────── */

/**
 * Named ranges the Dashboard + Watch Queue formulas depend on. Named ranges
 * follow their columns when the form inserts/renames/moves columns and when the
 * responses tab is renamed — so the dashboard keeps working after form edits.
 * Re-created on every setup / refresh.
 */
function ensureNamedRanges_(ss, rs, cols) {
	const h = headerMap_(rs);
	const put = function (name, col) {
		if (!col) return;
		ss.setNamedRange("tymn_" + name, rs.getRange(colLetter_(col) + "2:" + colLetter_(col)));
	};
	put("ts", 1);
	put("reviewer", cols.reviewer);
	put("school", cols.school);
	put("link", cols.link);
	put("valid", cols.valid);
	put("standout", cols.standout);
	put("confirm", cols.confirm);
	put("name",
		findCol_(h, "full name", { exclude: "school" }) ||
		findCol_(h, "first and last") ||
		findCol_(h, "name", { exclude: "canonical" }));
	put("category", findCol_(h, "category"));
	put("title", findCol_(h, "title"));
	put("video", findCol_(h, "submission video") || findCol_(h, "video"));
}

function buildDashboard_(ss, rs, cols) {
	let sh = ss.getSheetByName(DASHBOARD_SHEET);
	if (!sh) sh = ss.insertSheet(DASHBOARD_SHEET, 0);
	sh.clear();

	ensureNamedRanges_(ss, rs, cols);

	const rows = [
		["TYMN Fall Kickoff — review dashboard", ""],
		["", ""],
		["Submissions received", "=COUNTA(tymn_ts)"],
		["Reviewed (Yes or No)", '=COUNTIF(tymn_valid,"Yes")+COUNTIF(tymn_valid,"No")'],
		["Needs 2nd look", '=COUNTIF(tymn_valid,"Needs 2nd look")'],
		["Pending (not yet triaged)", "=B3-B4-B5"],
		["", ""],
		["Valid submissions", '=COUNTIF(tymn_valid,"Yes")'],
		["Bad / re-request links", '=COUNTIF(tymn_link,"No*")'],
		["Valid but unmapped to a school", '=COUNTIFS(tymn_valid,"Yes",tymn_school,"")'],
		["", ""],
		["Standouts nominated", "=COUNTIF(tymn_standout,TRUE)"],
		["Standouts confirmed", '=COUNTIF(tymn_confirm,"Yes")'],
		["", ""],
		["Per reviewer (reviewed count)", ""],
	];
	sh.getRange(1, 1, rows.length, 2).setValues(rows);

	// per-reviewer table driven by Config reviewer list
	sh.getRange("A16").setFormula(
		"=IFERROR(FILTER(" + CONFIG_SHEET + "!A2:A, " + CONFIG_SHEET +
			'!A2:A<>""), "(add reviewers in Config)")',
	);
	sh.getRange("B16").setFormula(
		'=ARRAYFORMULA(IF(A16:A="",,' +
			'COUNTIFS(tymn_reviewer,A16:A,tymn_valid,"Yes")+' +
			'COUNTIFS(tymn_reviewer,A16:A,tymn_valid,"No")))',
	);

	// per-school valid-submission table
	sh.getRange("D2").setValue("School").setFontWeight("bold");
	sh.getRange("E2").setValue("Valid submissions").setFontWeight("bold");
	sh.getRange("D3").setFormula(
		'=IFERROR(QUERY({tymn_school,tymn_valid},' +
			"\"select Col1, count(Col2) where Col2 = 'Yes' and Col1 is not null and Col1 <> '' " +
			'group by Col1 order by count(Col2) desc label count(Col2) \'\'",0),"(no valid submissions yet)")',
	);

	sh.getRange("A1").setFontSize(14).setFontWeight("bold");
	sh.getRange("A3:A15").setFontWeight("bold");
	sh.setColumnWidths(1, 1, 240);
	sh.setColumnWidths(4, 1, 240);
	sh.setFrozenRows(1);
}

function openDashboard() {
	const ss = SpreadsheetApp.getActiveSpreadsheet();
	const sh = ss.getSheetByName(DASHBOARD_SHEET);
	if (sh) {
		ss.setActiveSheet(sh);
	} else {
		setupReviewSheet();
	}
}

/* ─────────────────────── small helpers ────────────────────── */

function colLetter_(col) {
	let s = "";
	while (col > 0) {
		const m = (col - 1) % 26;
		s = String.fromCharCode(65 + m) + s;
		col = (col - m - 1) / 26;
	}
	return s;
}

function valAt_(rs, row, col) {
	return col ? rs.getRange(row, col).getValue() : "";
}
