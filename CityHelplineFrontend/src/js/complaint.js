/**
 * complaint.js
 * Handles the "File a Complaint" page.
 *
 * Server expects (POST /api/complaints, multipart/form-data):
 *   lat          {number}  — latitude
 *   long         {number}  — longitude (NOT "lng")
 *   description  {string}  — min 20 chars
 *   category_id  {string}  — required
 *   image        {file}    — required (field name must be "image")
 */

import { getCurrentUser } from "../services/authService.js";
import { checkAuth, logoutUser } from "../utils/auth.js";
import { fileComplaint } from "../services/complaintService.js";

// ── Auth ───────────────────────────────────────────────────────
checkAuth();

document.getElementById("logout-btn").addEventListener("click", logoutUser);

getCurrentUser()
  .then(user => {
    document.getElementById("nav-username").textContent =
      `Hey, ${user.name || "User"} 👋`;
  })
  .catch(() => {
    // Non-fatal — checkAuth already guards the page
  });

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = "toast"; }, 3500);
}

// ── Image upload & preview ─────────────────────────────────────
let selectedImageFile = null;

const uploadArea = document.getElementById("upload-area");
const imageInput = document.getElementById("c-image");
const previewBox = document.getElementById("image-preview");
const previewImg = document.getElementById("preview-img");
const removeBtn  = document.getElementById("remove-image");

imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showToast("Image must be under 5MB.", "error");
    imageInput.value = "";
    return;
  }

  selectedImageFile = file;

  const reader = new FileReader();
  reader.onload = (ev) => {
    previewImg.src = ev.target.result;
    previewBox.style.display = "block";
    uploadArea.style.display = "none";
  };
  reader.readAsDataURL(file);
});

// Drag and drop support
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) {
    imageInput.files = e.dataTransfer.files;
    imageInput.dispatchEvent(new Event("change"));
  }
});

removeBtn.addEventListener("click", () => {
  selectedImageFile   = null;
  imageInput.value    = "";
  previewImg.src      = "";
  previewBox.style.display = "none";
  uploadArea.style.display = "block";
});

// ── Map location picker ────────────────────────────────────────
let pickedLat = null;
let pickedLng = null; // stored locally as lng, sent to server as "long"
let pinMarker = null;

const DEFAULT_LAT = 30.2856;
const DEFAULT_LNG = 78.0300;

const pickMap = L.map("pick-map").setView([DEFAULT_LAT, DEFAULT_LNG], 15);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a>',
  maxZoom: 19,
}).addTo(pickMap);

function setPickedLocation(lat, lng, metaText) {
  pickedLat = Number(lat).toFixed(6);
  pickedLng = Number(lng).toFixed(6);

  document.getElementById("coords-text").textContent =
    metaText ? `${pickedLat}, ${pickedLng} — ${metaText}` : `${pickedLat}, ${pickedLng}`;

  const ll = L.latLng(Number(pickedLat), Number(pickedLng));
  pickMap.setView(ll, 15);

  if (pinMarker) pinMarker.setLatLng(ll);
  else pinMarker = L.marker(ll).addTo(pickMap);
}

async function detectLocation() {
  const coordsText = document.getElementById("coords-text");
  coordsText.textContent = "Detecting your location…";

  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by your browser. Using default location.", "error");
    setPickedLocation(DEFAULT_LAT, DEFAULT_LNG, "default");
    return;
  }

  // Try to get the most accurate fix we can quickly.
  // Many browsers return a coarse/cached location first; watchPosition usually improves it.
  await new Promise((resolve) => {
    let best = null; // { lat, lng, acc }
    let updates = 0;
    let watchId = null;

    const applyBest = (tag) => {
      const acc = Math.round(best?.acc ?? 0);
      const meta = acc ? `${tag}, ±${acc}m` : tag;
      setPickedLocation(best.lat, best.lng, meta);
    };

    const finish = (tag) => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (best) applyBest(tag);
      resolve();
    };

    const onPos = (pos) => {
      updates += 1;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : Infinity;

      if (!best || acc < best.acc) {
        best = { lat, lng, acc };
        applyBest("auto");
      }

      // Stop early if accuracy is already good enough.
      if (acc <= 80) finish("auto");
      // Otherwise stop after a few improvements.
      if (updates >= 3) finish("auto");
    };

    const onErr = (err) => {
      console.warn("Geolocation error:", err);
      showToast("Location permission denied/unavailable. Using default location.", "error");
      setPickedLocation(DEFAULT_LAT, DEFAULT_LNG, "default");
      resolve();
    };

    // Force fresh reading (no cached location), try high accuracy.
    try {
      watchId = navigator.geolocation.watchPosition(
        onPos,
        onErr,
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    } catch (e) {
      onErr(e);
      return;
    }

    // Safety stop: don’t hang forever.
    setTimeout(() => {
      if (best) finish("auto");
      else onErr(new Error("Geolocation timeout"));
    }, 14000);
  });
}

// ── Submit ─────────────────────────────────────────────────────
const submitBtn = document.getElementById("submit-btn");

submitBtn.addEventListener("click", async () => {
  const desc       = document.getElementById("c-desc").value.trim();
  const categoryId = document.getElementById("c-category").value;

  // Validate — mirrors server rules exactly
  if (!categoryId) {
    showToast("Please select a category.", "error");
    return;
  }
  if (!desc || desc.length < 20) {
    showToast("Description must be at least 20 characters.", "error");
    return;
  }
  if (!pickedLat || !pickedLng) {
    showToast("Please pin the location on the map.", "error");
    return;
  }
  if (!selectedImageFile) {
    showToast("Please attach an evidence photo.", "error");
    return;
  }

  submitBtn.disabled    = true;
  submitBtn.textContent = "Submitting…";

  try {
    const complaintData = {
      lat:         parseFloat(pickedLat),
      long:        parseFloat(pickedLng),  // server reads "long", NOT "lng"
      description: desc,
      category_id: categoryId,
      // title and area are NOT sent — no such columns in the DB
    };

    // fileComplaint sends as multipart FormData with image field named "image"
    const result = await fileComplaint(complaintData, selectedImageFile);
    if (!result) return; // 401 redirect handled inside service

    showToast("✅ Complaint filed successfully!");

    // Reset form
    document.getElementById("c-desc").value      = "";
    document.getElementById("c-category").value  = "";
    if (pinMarker) { pickMap.removeLayer(pinMarker); pinMarker = null; }
    pickedLat = null;
    pickedLng = null;
    await detectLocation();
    removeBtn.click(); // clear image preview

    setTimeout(() => { window.location.href = "dashboard.html"; }, 1800);

  } catch (err) {
    console.error(err);
    showToast(err.message || "Something went wrong. Is the server running?", "error");

  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = "Submit Complaint";
  }
});

// ── Init ───────────────────────────────────────────────────────
lucide.createIcons();
detectLocation();