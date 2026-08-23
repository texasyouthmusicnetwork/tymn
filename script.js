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

function renderHeroSlide(slide) {
	return `
		<div class="hero-slide" style="background-image: url('${slide.image}');">
			<div class="hero-slide-kicker">Texas Youth <span>Music</span> Network</div>
			<div class="hero-slide-content">
				<h2 class="hero-slide-title">${slide.title}</h2>
				<p class="hero-slide-desc">${slide.desc}</p>
				<a href="${slide.link}" class="btn-primary hero-slide-btn">${slide.linkText}</a>
			</div>
		</div>
	`;
}

async function initHeroCarousel() {
	const carousel = document.getElementById("heroCarousel");
	if (!carousel) return;

	const track = carousel.querySelector(".hero-track");
	const dotsContainer = carousel.querySelector(".hero-dots");
	const prevBtn = carousel.querySelector(".hero-arrow.prev");
	const nextBtn = carousel.querySelector(".hero-arrow.next");

	// ★ Carousel content lives in slides.json — add, remove, or reorder
	// events there without touching this file or index.html.
	const res = await fetch("slides.json");
	const slidesData = await res.json();
	if (!slidesData.length) return;

	track.innerHTML = slidesData.map(renderHeroSlide).join("");
	dotsContainer.innerHTML = slidesData
		.map(
			(_, i) =>
				`<button class="hero-dot${i === 0 ? " active" : ""}" data-slide="${i}" aria-label="Show slide ${i + 1}"></button>`,
		)
		.join("");

	const slides = carousel.querySelectorAll(".hero-slide");
	const dots = carousel.querySelectorAll(".hero-dot");
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
