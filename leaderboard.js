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
   } */

async function loadStandings() {
	const res = await fetch("leaderboard-data.json");
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

async function initLeaderboard() {
	const miniEl = document.getElementById("miniLeaderboard");
	const fullEl = document.getElementById("leaderboardFull");
	const summaryEl = document.getElementById("leaderboardSummary");

	if (!miniEl && !fullEl) return;

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

// Entry form doesn't open until the challenge officially starts.
// Disables every ".js-entry-link" button until that date, then leaves
// them alone (the real Google Form link) from then on.
const ENTRY_OPEN_DATE = new Date(2026, 8, 1); // September 1, 2026

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
