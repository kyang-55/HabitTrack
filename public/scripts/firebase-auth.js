const LOCAL_SERVER_ORIGIN = "http://localhost:3000";

const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );

const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";

let firebaseConfigPromise = null;

async function readJson(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
}

async function getFirebaseConfig() {
    if (!firebaseConfigPromise) {
        firebaseConfigPromise = fetch(`${API}/auth/firebase-config`, { credentials: "include" })
            .then(readJson)
            .then((config) => {
                if (!config?.enabled || !config.apiKey || !config.projectId) {
                    throw new Error("Firebase Auth is not configured yet. Add the Firebase env vars first.");
                }

                return config;
            });
    }

    return firebaseConfigPromise;
}

function getContinueUrl(path = "/pages/login.html") {
    return new URL(path, window.location.origin).toString();
}

/* =========================
   🔥 CORE CALL
========================= */
async function callFirebaseAuth(endpoint, body) {
    const config = await getFirebaseConfig();

    console.log(`📡 Firebase → ${endpoint}`, body);

    const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(config.apiKey)}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }
    );

    const data = await readJson(res);

    if (!res.ok) {
        const code = String(data?.error?.message || "UNKNOWN_ERROR");
        console.error("❌ Firebase ERROR:", code, data);
        throw new Error(getFirebaseErrorMessage(code));
    }

    console.log("✅ Firebase SUCCESS:", endpoint);
    return data;
}

/* =========================
   🧠 ERROR MAPPING
========================= */
function getFirebaseErrorMessage(code) {
    switch (code) {
    case "EMAIL_EXISTS":
        return "An account with that email already exists.";
    case "EMAIL_NOT_FOUND":
    case "INVALID_LOGIN_CREDENTIALS":
    case "INVALID_PASSWORD":
        return "Invalid email or password.";
    case "USER_DISABLED":
        return "This account has been disabled.";
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
        return "Too many attempts. Please wait a bit and try again.";
    case "INVALID_ID_TOKEN":
    case "TOKEN_EXPIRED":
        return "Your sign-in expired. Please try again.";
    case "OPERATION_NOT_ALLOWED":
        return "Email/password sign-in is not enabled in Firebase yet.";
    case "WEAK_PASSWORD":
        return "Password should be stronger.";
    default:
        return code.replaceAll("_", " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
    }
}

/* =========================
   📝 REGISTER (FIXED)
========================= */
async function registerWithFirebase({ name, email, password }) {
    console.log("🔥 Registering user...");

    const signUp = await callFirebaseAuth("accounts:signUp", {
        email,
        password,
        returnSecureToken: true
    });

    console.log("✅ User created:", signUp);

    if (name) {
        await callFirebaseAuth("accounts:update", {
            idToken: signUp.idToken,
            displayName: name,
            returnSecureToken: false
        });

        console.log("✅ Name updated");
    }

    console.log("📨 Sending verification email...");

    try {
        await callFirebaseAuth("accounts:sendOobCode", {
            requestType: "VERIFY_EMAIL",
            idToken: signUp.idToken,
            continueUrl: getContinueUrl("/pages/login.html"),
            canHandleCodeInApp: false
        });

        console.log("✅ Verification email SENT");
    } catch (err) {
        console.error("❌ Verification email FAILED:", err.message);
    }

    return signUp;
}

/* =========================
   🔑 LOGIN
========================= */
async function signInWithFirebase({ email, password }) {
    console.log("🔐 Signing in...");

    return callFirebaseAuth("accounts:signInWithPassword", {
        email,
        password,
        returnSecureToken: true
    });
}

/* =========================
   🔁 PASSWORD RESET
========================= */
async function sendPasswordResetWithFirebase(email) {
    console.log("🔁 Sending password reset email...");

    return callFirebaseAuth("accounts:sendOobCode", {
        requestType: "PASSWORD_RESET",
        email,
        continueUrl: getContinueUrl("/pages/reset.html"), // your change kept
        canHandleCodeInApp: true
    });
}

/* =========================
   📧 RESEND VERIFY
========================= */
async function sendVerificationEmailWithFirebase(idToken) {
    console.log("📨 Resending verification email...");

    return callFirebaseAuth("accounts:sendOobCode", {
        requestType: "VERIFY_EMAIL",
        idToken,
        continueUrl: getContinueUrl("/pages/login.html"),
        canHandleCodeInApp: false
    });
}

/* =========================
   🍪 SESSION
========================= */
async function createServerSessionFromFirebase(idToken, rememberMe) {
    console.log("🍪 Creating session...");

    const res = await fetch(`${API}/auth/firebase-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken, rememberMe })
    });

    const data = await readJson(res);

    if (!res.ok) {
        console.error("❌ Session failed:", data);
        throw new Error(data?.error || "Unable to create a HabitTrack session.");
    }

    console.log("✅ Session created");

    return data;
}

window.HabitTrackFirebaseAuth = {
    API,
    getFirebaseConfig,
    getFirebaseErrorMessage,
    registerWithFirebase,
    signInWithFirebase,
    sendPasswordResetWithFirebase,
    sendVerificationEmailWithFirebase,
    createServerSessionFromFirebase
};