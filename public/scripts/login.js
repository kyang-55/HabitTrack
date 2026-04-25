const PAGE_BASE = window.HabitTrackFirebaseAuth?.API ? `${window.HabitTrackFirebaseAuth.API}/pages` : ".";

function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

function setSubmitting(isSubmitting) {
    const button = document.getElementById("loginButton");
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Signing in..." : "Continue";
}

function getLoginEmail(value) {
    const email = String(value || "").trim().toLowerCase();

    if (!email) {
        throw new Error("Enter your email first.");
    }

    return email;
}

function getPendingProfileSeed() {
    try {
        const raw = sessionStorage.getItem("habittrack_pending_profile");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

const loginForm = document.getElementById("loginForm");
window.HabitTrackAuthUI?.enableBrowserNotifications(loginForm);

function showStoredNotice() {
    const message = sessionStorage.getItem("habittrack_notice");
    if (!message) return;

    sessionStorage.removeItem("habittrack_notice");
    showFeedback(message);
}

async function redirectIfAuthenticated() {
    try {
        const res = await fetch(`${window.HabitTrackFirebaseAuth.API}/auth/me`, { credentials: "include" });
        if (res.ok) {
            window.location.replace(`${PAGE_BASE}/index.html`);
        }
    } catch {
        // Keep the user on the login page if the server is unavailable.
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");
    setSubmitting(true);

    const emailInput = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const rememberMe = document.getElementById("rememberMe").checked;

    try {
        const email = getLoginEmail(emailInput);
        const signIn = await window.HabitTrackFirebaseAuth.signInWithFirebase({ email, password });
        const pendingProfile = getPendingProfileSeed();
        await window.HabitTrackFirebaseAuth.createServerSessionFromFirebase(signIn.idToken, rememberMe, pendingProfile || {});
        if (pendingProfile) {
            sessionStorage.setItem("habittrack_welcome_new_user", "true");
        }
        sessionStorage.removeItem("habittrack_pending_profile");
        window.location.replace(`${PAGE_BASE}/index.html`);
    } catch (error) {
        const message = error.message || "Unable to log in.";
        showFeedback(message);
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Login failed",
            message,
            "habittrack-login-failed"
        );
        setSubmitting(false);
    }
});

document.getElementById("resendVerificationButton")?.addEventListener("click", async () => {
    showFeedback("");
    const emailInput = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (!emailInput || !password) {
        showFeedback("Enter your email and password first so we know which account to resend for.");
        return;
    }

    try {
        const email = getLoginEmail(emailInput);
        const signIn = await window.HabitTrackFirebaseAuth.signInWithFirebase({ email, password });
        await window.HabitTrackFirebaseAuth.sendVerificationEmailWithFirebase(signIn.idToken);
        showFeedback("Verification email sent. Check your inbox, then come back and log in again.");
    } catch (error) {
        showFeedback(error.message || "Unable to resend verification email.");
    }
});

showStoredNotice();
redirectIfAuthenticated();
