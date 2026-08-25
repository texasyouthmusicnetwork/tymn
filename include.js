// Bump this whenever header.html/footer.html change, so browsers
// that cached the old partials pick up the new version right away.
const LAYOUT_VERSION = "8";

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

	document
		.querySelectorAll(".nav-links a, .nav-mobile-links a")
		.forEach((link) => {
			if (link.classList.contains("nav-cta")) return;
			let linkPage = link.getAttribute("href").split("#")[0];
			if (!linkPage.endsWith("/")) linkPage += "/";
			if (linkPage === current) link.classList.add("active");
		});
}

function initMobileNav() {
	const nav = document.querySelector("nav");
	const toggle = document.querySelector(".nav-toggle");
	const mobilePanel = document.getElementById("mobileNav");
	if (!nav || !toggle || !mobilePanel) return;

	function closeMenu() {
		nav.classList.remove("nav-open");
		toggle.setAttribute("aria-expanded", "false");
	}

	function openMenu() {
		nav.classList.add("nav-open");
		toggle.setAttribute("aria-expanded", "true");
	}

	toggle.addEventListener("click", () => {
		if (nav.classList.contains("nav-open")) {
			closeMenu();
		} else {
			openMenu();
		}
	});

	mobilePanel.querySelectorAll("a").forEach((link) => {
		link.addEventListener("click", closeMenu);
	});

	document.addEventListener("click", (event) => {
		if (!nav.contains(event.target)) closeMenu();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") closeMenu();
	});

	window.addEventListener("resize", () => {
		if (window.innerWidth > 900) closeMenu();
	});
}

document.addEventListener("DOMContentLoaded", async () => {
	await Promise.all([
		includeHTML("#site-header", "/header.html"),
		includeHTML("#site-footer", "/footer.html"),
	]);
	markActiveNavLink();
	initMobileNav();
	document.dispatchEvent(new CustomEvent("layoutIncluded"));
});
