function handleFormSubmit() {
	const fname = document.getElementById("fname").value.trim();
	const email = document.getElementById("email").value.trim();
	const role = document.getElementById("role").value;

	if (!fname || !email || !role) {
		alert(
			"Please fill in your name, email, and role before submitting.",
		);
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
