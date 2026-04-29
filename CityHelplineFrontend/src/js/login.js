import { loginUser } from "../services/authService.js";

const form     = document.getElementById("loginForm");
const message  = document.getElementById("message");
const loginBtn = document.getElementById("loginBtn");

function initPasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selector = btn.getAttribute("data-toggle-password");
      const input = selector ? document.querySelector(selector) : null;
      if (!input) return;

      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      btn.textContent = isHidden ? "Hide" : "Show";
      btn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  });
}

function showMessage(text, type) {
  message.textContent = text;
  message.className   = `message ${type}`;
}

initPasswordToggles();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginBtn.disabled = true;

  const data = {
    email:    document.getElementById("email").value.trim(),
    password: document.getElementById("password").value,
  };

  try {
    const res = await loginUser(data);

    localStorage.setItem("token", res.token);

    // Store username for navbar greeting (use whatever field your server returns)
    if (res.user?.name) {
      localStorage.setItem("name", res.user.name);
      localStorage.setItem("username", res.user.name);
    }
    // store role
    if (res.user?.role) {
      localStorage.setItem("role", res.user.role);
    }

    showMessage(`Welcome back, ${res.user?.name || "User"}!`, "success");

    setTimeout(() => {
      if(res.user?.role === "admin"){
        window.location.href = "admin-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    }, 400);

  } catch (error) {          // ← was missing (error) — caused ReferenceError
    console.error(error);
    showMessage(error.message || "Login failed. Please try again.", "error");

  } finally {
    loginBtn.disabled = false;
  }
});