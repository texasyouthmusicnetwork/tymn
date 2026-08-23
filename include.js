// Bump this whenever header.html/footer.html change, so browsers
// that cached the old partials pick up the new version right away.
const LAYOUT_VERSION = "5";

async function includeHTML(selector, url) {
	const el = document.querySelector(selector);
	if (!el) return;
	const res = await fetch(`${url}?v=${LAYOUT_VERSION}`);
	el.innerHTML = await res.text();
}

function markActiveNavLink() {
	// Normalize the current path so both "/about" and "/about/" match
	// the "/about/" link in the nav, and the homepage normalizes to "/".
	let current = window.location.pathname.replace(/index\.html$/, "");
	if (!current.endsWith("/")) current += "/";

	document.querySelectorAll(".nav-links a").forEach((link) => {
		if (link.classList.contains("nav-cta")) return;
		let linkPage = link.getAttribute("href").split("#")[0];
		if (!linkPage.endsWith("/")) linkPage += "/";
		if (linkPage === current) link.classList.add("active");
	});
}

document.addEventListener("DOMContentLoaded", async () => {
	await Promise.all([
		includeHTML("#site-header", "/header.html"),
		includeHTML("#site-footer", "/footer.html"),
	]);
	markActiveNavLink();
	document.dispatchEvent(new CustomEvent("layoutIncluded"));
});
