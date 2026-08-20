async function includeHTML(selector, url) {
	const el = document.querySelector(selector);
	if (!el) return;
	const res = await fetch(url);
	el.innerHTML = await res.text();
}

function markActiveNavLink() {
	let current = window.location.pathname.split("/").pop();
	if (!current) current = "index.html";

	document.querySelectorAll(".nav-links a").forEach((link) => {
		if (link.classList.contains("nav-cta")) return;
		const linkPage = link.getAttribute("href").split("#")[0];
		if (linkPage === current) link.classList.add("active");
	});
}

document.addEventListener("DOMContentLoaded", async () => {
	await Promise.all([
		includeHTML("#site-header", "header.html"),
		includeHTML("#site-footer", "footer.html"),
	]);
	markActiveNavLink();
	document.dispatchEvent(new CustomEvent("layoutIncluded"));
});
