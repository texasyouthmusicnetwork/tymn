function handleFormSubmit() {
	const fname = document.getElementById("fname").value.trim();
	const email = document.getElementById("email").value.trim();
	const role = document.getElementById("role").value;

	if (!fname || !email || !role) {
		alert("Please fill in your name, email, and role before submitting.");
		return;
	}

	// ★ PLACEHOLDER: Replace this with your actual form submission logic.
	// Options: connect to a Google Form, Airtable, Mailchimp, or a backend endpoint.
	// For a quick no-code solution, embed a Google Form iframe instead of this HTML form.
	alert(
		"Thanks, " +
			fname +
			"! We've received your interest and will be in touch soon.",
	);

	document.getElementById("fname").value = "";
	document.getElementById("lname").value = "";
	document.getElementById("email").value = "";
	document.getElementById("role").value = "";
	document.getElementById("city").value = "";
	document.getElementById("instrument").value = "";
}

function initHeroCarousel() {
	const carousel = document.getElementById("heroCarousel");
	if (!carousel) return;

	const track = carousel.querySelector(".hero-track");
	const slides = carousel.querySelectorAll(".hero-slide");
	const dots = carousel.querySelectorAll(".hero-dot");
	const prevBtn = carousel.querySelector(".hero-arrow.prev");
	const nextBtn = carousel.querySelector(".hero-arrow.next");
	let current = 0;
	let timer;

	function goTo(index) {
		dots[current].classList.remove("active");
		current = (index + slides.length) % slides.length;
		track.style.transform = `translateX(-${current * 100}%)`;
		dots[current].classList.add("active");
	}

	function next() {
		goTo(current + 1);
	}

	function prev() {
		goTo(current - 1);
	}

	function resetAutoplay() {
		clearInterval(timer);
		timer = setInterval(next, 7000);
	}

	prevBtn.addEventListener("click", () => {
		prev();
		resetAutoplay();
	});
	nextBtn.addEventListener("click", () => {
		next();
		resetAutoplay();
	});
	dots.forEach((dot, i) => {
		dot.addEventListener("click", () => {
			goTo(i);
			resetAutoplay();
		});
	});

	resetAutoplay();
}

document.addEventListener("DOMContentLoaded", initHeroCarousel);
