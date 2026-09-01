/* TYMN School Leaderboard
   Renders leaderboard-data.json into #miniLeaderboard (kickoff.html)
   and #leaderboardFull / #leaderboardSummary (leaderboard.html).

   To update standings: bump a school's "rp" as submissions/awards
   come in. Once a week, copy "rp" into "rpLastWeek" to snapshot it —
   that's what drives the rank-change arrows. A new school starts
   with rpLastWeek: null and shows a "NEW" badge until its first
   snapshot.

   Each entry in leaderboard-data.json needs this shape:
   {
     "school": "Example High School",
     "city": "Austin",
     "status": "verified",           // or "pending"
     "rp": 1350,
     "rpLastWeek": 1000,             // null for a brand-new school
     "submissions": 4,
     "uniqueInstruments": 3,
     "outstandingPerformers": 1      // 0 if none yet
   }

   Whether standings are shown publicly is controlled by the single
   toggle below — it covers every page at once. */

/* ═══════════════════════════════════════════════════════════════════
   LEADERBOARD VISIBILITY TOGGLE — the only place to flip standings
   on or off. Applies everywhere: the full leaderboard page and the
   top-3 mini leaderboard on the kickoff page.

   visible: true   → standings show normally
   visible: false  → standings are withheld everywhere. The full
                     leaderboard page shows hiddenMessage in place of
                     the table, the kickoff page's mini-leaderboard
                     card is removed entirely, and leaderboard-data.json
                     is never fetched, so nothing leaks to the page.

   Commit and push for the change to take effect on the live site.
   ═══════════════════════════════════════════════════════════════════ */
const TYMN_LEADERBOARD = {
	visible: false,
	hiddenMessage: "Standings are being updated — check back soon.",
};

function leaderboardVisibility() {
	return {
		visible: TYMN_LEADERBOARD.visible !== false,
		hiddenMessage:
			TYMN_LEADERBOARD.hiddenMessage ||
			"Standings are being updated — check back soon.",
	};
}

async function loadStandings() {
	const res = await fetch("/leaderboard-data.json");
	const schools = await res.json();

	// Current standings, ranked by RP today.
	const byRp = [...schools].sort((a, b) => (b.rp ?? 0) - (a.rp ?? 0));
	byRp.forEach((s, i) => (s.rank = i + 1));

	// Standings a week ago, ranked by last week's RP snapshot.
	// Schools with no snapshot yet (rpLastWeek === null) are brand new
	// and don't participate in the "who moved" comparison.
	const hadLastWeek = byRp.filter((s) => s.rpLastWeek != null);
	const byRpLastWeek = [...hadLastWeek].sort(
		(a, b) => b.rpLastWeek - a.rpLastWeek,
	);
	const lastWeekRank = {};
	byRpLastWeek.forEach((s, i) => (lastWeekRank[s.school] = i + 1));

	byRp.forEach((s) => {
		if (s.rpLastWeek == null) {
			s.isNew = true;
			s.rankChange = null;
			s.rpChange = s.rp;
		} else {
			s.isNew = false;
			s.rankChange = lastWeekRank[s.school] - s.rank; // positive = moved up
			s.rpChange = s.rp - s.rpLastWeek;
		}
	});

	return byRp;
}

function rankChangeHTML(s) {
	if (s.isNew) {
		return `<span class="rank-change new">New</span>`;
	}
	if (s.rankChange > 0) {
		return `<span class="rank-change up">▲ ${s.rankChange}</span>`;
	}
	if (s.rankChange < 0) {
		return `<span class="rank-change down">▼ ${Math.abs(s.rankChange)}</span>`;
	}
	return `<span class="rank-change same">–</span>`;
}

function rpChangeHTML(s) {
	if (s.isNew) return `<span class="rp-change new">New entry</span>`;
	if (s.rpChange > 0)
		return `<span class="rp-change up">+${s.rpChange.toLocaleString()} this week</span>`;
	if (s.rpChange < 0)
		return `<span class="rp-change down">${s.rpChange.toLocaleString()} this week</span>`;
	return `<span class="rp-change same">No change this week</span>`;
}

function renderMiniRow(s) {
	return `
		<div class="mini-leaderboard-row">
			<span class="mini-rank">${s.rank}</span>
			<span class="mini-school">${s.school}</span>
			<span class="mini-rp">${(s.rp ?? 0).toLocaleString()}</span>
		</div>
	`;
}

function renderRow(s, { showExtra }) {
	const topClass = s.rank <= 3 ? " top3" : "";
	const pendingBadge =
		s.status === "pending"
			? `<span class="rank-badge pending">Pending</span>`
			: "";

	const submissions = s.submissions ?? 0;
	const uniqueInstruments = s.uniqueInstruments ?? 0;
	const outstandingPerformers = s.outstandingPerformers ?? 0;

	const meta = showExtra
		? `${s.city} · ${submissions} submission${submissions === 1 ? "" : "s"} · ${uniqueInstruments} instrument${uniqueInstruments === 1 ? "" : "s"}${
				outstandingPerformers
					? ` · ${outstandingPerformers} Outstanding Performer${outstandingPerformers > 1 ? "s" : ""}`
					: ""
			}`
		: s.city;

	return `
		<div class="leaderboard-row${topClass}">
			<div class="leaderboard-rank">
				<span class="rank-num">${s.rank}</span>
				${rankChangeHTML(s)}
			</div>
			<div class="leaderboard-school">
				<div class="leaderboard-school-name">${s.school}${pendingBadge}</div>
				<div class="leaderboard-school-meta">${meta}</div>
			</div>
			<div class="leaderboard-rp">
				<span class="rp-value">${(s.rp ?? 0).toLocaleString()}<span class="rp-unit">RP</span></span>
				${rpChangeHTML(s)}
			</div>
		</div>
	`;
}

function renderSummary(standings) {
	const totalSchools = standings.length;
	const totalSubmissions = standings.reduce((n, s) => n + (s.submissions ?? 0), 0);
	const totalOutstanding = standings.reduce(
		(n, s) => n + (s.outstandingPerformers ?? 0),
		0,
	);
	const instrumentSum = standings.reduce((n, s) => n + (s.uniqueInstruments ?? 0), 0);

	return `
		<div class="stat-item">
			<span class="stat-label">Schools on the Board</span>
			<span class="stat-value">${totalSchools}</span>
			<span class="stat-desc">Verified and pending schools combined.</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">Total Submissions</span>
			<span class="stat-value">${totalSubmissions}</span>
			<span class="stat-desc">Performances entered so far this season.</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">Outstanding Performers</span>
			<span class="stat-value">${totalOutstanding}</span>
			<span class="stat-desc">Individual standouts named across all schools.</span>
		</div>
		<div class="stat-item">
			<span class="stat-label">Instrument Sections</span>
			<span class="stat-value">${instrumentSum}</span>
			<span class="stat-desc">Combined unique-instrument bonuses earned.</span>
		</div>
	`;
}

function escapeHTML(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

async function initLeaderboard() {
	const miniEl = document.getElementById("miniLeaderboard");
	const fullEl = document.getElementById("leaderboardFull");
	const summaryEl = document.getElementById("leaderboardSummary");

	if (!miniEl && !fullEl) return;

	// Standings withheld: show a short note in place of the tables and stats,
	// and hide any section marked data-hide-when-leaderboard-hidden. Checked
	// before the fetch, so hidden standings never reach the page.
	const { visible, hiddenMessage } = leaderboardVisibility();
	if (!visible) {
		const msg = escapeHTML(hiddenMessage);
		if (miniEl) {
			miniEl.innerHTML = `<p class="mini-leaderboard-empty">${msg}</p>`;
		}
		if (fullEl) {
			fullEl.innerHTML = `<div class="leaderboard-empty"><p>${msg}</p></div>`;
		}
		if (summaryEl) summaryEl.innerHTML = "";
		document
			.querySelectorAll("[data-hide-when-leaderboard-hidden]")
			.forEach((el) => {
				el.style.display = "none";
			});
		return;
	}

	const standings = await loadStandings();

	if (miniEl) {
		miniEl.innerHTML = standings.length
			? standings.slice(0, 3).map(renderMiniRow).join("")
			: `<p class="mini-leaderboard-empty">No submissions yet — be the first.</p>`;
	}

	if (fullEl) {
		fullEl.innerHTML = standings.length
			? standings.map((s) => renderRow(s, { showExtra: true })).join("")
			: `<div class="leaderboard-empty">
					<p>No submissions yet.</p>
					<p>
						Standings will start filling in once the Fall Kickoff
						Challenge opens on September 1 — check back soon.
					</p>
				</div>`;
	}

	if (summaryEl) {
		summaryEl.innerHTML = renderSummary(standings);
	}
}

document.addEventListener("DOMContentLoaded", initLeaderboard);

// Entries opened early (before the official Sept 1-30 season) so
// students have something to do right away; the leaderboard and the
// "official" challenge dates are still September 1-30. Kept as a
// reusable date gate in case a future season needs a staged opening
// again -- ENTRY_OPEN_DATE just needs to be set in the past to disable it.
const ENTRY_OPEN_DATE = new Date(2026, 7, 28); // opened early, Aug 28 2026

function gateEntryLinks() {
	if (new Date() >= ENTRY_OPEN_DATE) return;

	document.querySelectorAll(".js-entry-link").forEach((link) => {
		link.classList.add("is-disabled");
		link.removeAttribute("href");
		link.removeAttribute("target");
		link.setAttribute("aria-disabled", "true");
		link.title = "Opens September 1, 2026";
		link.textContent = "Not Open Yet";
		link.addEventListener("click", (e) => e.preventDefault());
	});
}

document.addEventListener("DOMContentLoaded", gateEntryLinks);
