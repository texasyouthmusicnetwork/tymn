/* ─────────────────────────────────────────────────────────────
   TYMN School Leaderboard
   ─────────────────────────────────────────────────────────────
   ★ All leaderboard content lives in leaderboard-data.json — this
     file only renders it. To update standings for real:

     1. Bump a school's "rp" value up as new submissions/awards come in
        (see the scoring breakdown on kickoff.html for point values).
     2. Once a week, copy each school's current "rp" into "rpLastWeek".
        That snapshot is what drives the rank-change arrows and the
        "this week" RP number below — you never have to compute a
        rank by hand.
     3. Add a brand-new school by adding a new object to the JSON
        array with rpLastWeek set to null — it will show a "NEW"
        badge instead of an arrow until its first weekly snapshot.

   This file is used on two pages:
     - kickoff.html      -> renders a top-3 mini widget into #miniLeaderboard
                             (tucked into the entry card at the top of the page)
     - leaderboard.html  -> renders the full board into #leaderboardFull
                             plus summary stats into #leaderboardSummary
   ───────────────────────────────────────────────────────────── */

async function loadStandings() {
	const res = await fetch("leaderboard-data.json");
	const schools = await res.json();

	// Current standings, ranked by RP today.
	const byRp = [...schools].sort((a, b) => b.rp - a.rp);
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
			<span class="mini-rp">${s.rp.toLocaleString()}</span>
		</div>
	`;
}

function renderRow(s, { showExtra }) {
	const topClass = s.rank <= 3 ? " top3" : "";
	const pendingBadge =
		s.status === "pending"
			? `<span class="rank-badge pending">Pending</span>`
			: "";

	const meta = showExtra
		? `${s.city} · ${s.submissions} submission${s.submissions === 1 ? "" : "s"} · ${s.uniqueInstruments} instrument${s.uniqueInstruments === 1 ? "" : "s"}${
				s.outstandingPerformers
					? ` · ${s.outstandingPerformers} Outstanding Performer${s.outstandingPerformers > 1 ? "s" : ""}`
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
				<span class="rp-value">${s.rp.toLocaleString()}<span class="rp-unit">RP</span></span>
				${rpChangeHTML(s)}
			</div>
		</div>
	`;
}

function renderSummary(standings) {
	const totalSchools = standings.length;
	const totalSubmissions = standings.reduce((n, s) => n + s.submissions, 0);
	const totalOutstanding = standings.reduce(
		(n, s) => n + s.outstandingPerformers,
		0,
	);
	const totalInstruments = new Set();
	// uniqueInstruments per school isn't broken out by name in demo data,
	// so this stat totals the per-school counts as a stand-in until real
	// instrument-name data is being collected.
	const instrumentSum = standings.reduce((n, s) => n + s.uniqueInstruments, 0);

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
	const previewEl = document.getElementById("leaderboardPreview");
	const fullEl = document.getElementById("leaderboardFull");
	const summaryEl = document.getElementById("leaderboardSummary");

	if (!miniEl && !previewEl && !fullEl) return;

	const standings = await loadStandings();

	if (miniEl) {
		miniEl.innerHTML = standings.slice(0, 3).map(renderMiniRow).join("");
	}

	if (previewEl) {
		previewEl.innerHTML = standings
			.slice(0, 5)
			.map((s) => renderRow(s, { showExtra: false }))
			.join("");
	}

	if (fullEl) {
		fullEl.innerHTML = standings
			.map((s) => renderRow(s, { showExtra: true }))
			.join("");
	}

	if (summaryEl) {
		summaryEl.innerHTML = renderSummary(standings);
	}
}

document.addEventListener("DOMContentLoaded", initLeaderboard);
