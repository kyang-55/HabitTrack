async function handleReset() {
    const params = new URLSearchParams(window.location.search);
    const oobCode = params.get("oobCode");
    const newPassword = document.getElementById("newPassword").value;
    const message = document.getElementById("resetPasswordMessage");

    if (!oobCode) {
        message.textContent = "Invalid or expired reset link.";
        return;
    }

    if (!newPassword) {
        message.textContent = "Please enter a new password.";
        return;
    }

    try {
        const configRes = await fetch("/auth/firebase-config");
        const config = await configRes.json();

        if (!config?.apiKey) {
            throw new Error("Missing Firebase config");
        }

        const res = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${encodeURIComponent(config.apiKey)}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    oobCode,
                    newPassword
                })
            }
        );

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data?.error?.message || "Reset failed");
        }

        message.textContent = "Password reset successful! Redirecting...";

        setTimeout(() => {
            window.location.href = "./login.html";
        }, 1500);

    } catch (err) {
        console.error(err);
        message.textContent = "Error: " + err.message;
    }
}