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

	// Carousel content lives in slides.json.
	const res = await fetch("/slides.json");
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

function initMailingListForm() {
	const form = document.getElementById("mailingListForm");
	if (!form) return;

	const frame = document.getElementById("mailingListFrame");
	const status = document.getElementById("mailingListStatus");
	const submitBtn = form.querySelector(".mailing-list-submit");
	let submitted = false;

	form.addEventListener("submit", () => {
		submitted = true;
		submitBtn.classList.add("is-disabled");
		status.textContent = "Signing you up…";
	});

	frame.addEventListener("load", () => {
		if (!submitted) return;
		submitted = false;
		submitBtn.classList.remove("is-disabled");
		status.textContent = "You're on the list — thanks for signing up!";
		form.reset();
	});
}

document.addEventListener("DOMContentLoaded", initHeroCarousel);
document.addEventListener("DOMContentLoaded", initMailingListForm);
