import { loginUser, registerUser } from "../services/authService.js";

const form      = document.getElementById("signupForm");
const message   = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

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

function persistSession(authRes) {
  if (authRes?.token) localStorage.setItem("token", authRes.token);
  if (authRes?.user?.name) {
    localStorage.setItem("name", authRes.user.name);
    localStorage.setItem("username", authRes.user.name);
  }
  if (authRes?.user?.role) localStorage.setItem("role", authRes.user.role);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const password        = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    showMessage("Passwords do not match. Try again.", "error");
    return;
  }

  submitBtn.disabled = true;

  //DATA OF REQ.

  const data = {
    name: document.getElementById("username").value.trim(),
    email:    document.getElementById("email").value.trim(),
    password,
  };

  try {
    const res = await registerUser(data);

    // Auto-login after signup:
    // - preferred: backend returns token on register
    // - fallback: immediately login with same credentials
    let authRes = res;
    if (!authRes?.token) {
      authRes = await loginUser({ email: data.email, password: data.password });
    }

    persistSession(authRes);

    showMessage(`Account created! Welcome, ${authRes.user?.name || "User"}!`, "success");

    setTimeout(() => {
      if (authRes.user?.role === "admin") {
        window.location.href = "admin-dashboard.html";
      } else {
        window.location.href = "dashboard.html";
      }
    }, 800);

  } catch (error) {
    console.error(error);
    showMessage(error.message || "Signup failed. Please try again.", "error");

  } finally {
    submitBtn.disabled = false;
  }
});