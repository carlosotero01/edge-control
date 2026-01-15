// app.js

// -----------------------------
// CONFIG (edit these endpoints)
// -----------------------------
const API_BASE = ""; // FastAPI base URL (use HTTPS in production)
const ENDPOINTS = {
  // Temperature:
  // - read once: GET /temperature
  // - start polling: handled in UI by setInterval calling /temperature
  temperature: `${API_BASE}/temperature`,

  // Camera power: POST /power?powerOn=true|false
  cameraPower: `${API_BASE}/power`,

  // Optional: a status/health endpoint (recommended)
  health: `${API_BASE}/health`
};

// Video stream URL is user-provided via input (must be https for TLS)

// -----------------------------
// DOM helpers
// -----------------------------
const $ = (id) => document.getElementById(id);

function nowIso() {
  return new Date().toISOString();
}

function logLine(message, level = "info") {
  const el = document.createElement("div");
  el.className = "line";
  el.innerHTML = `<span class="ts">${nowIso()}</span><span class="${level}">${escapeHtml(message)}</span>`;
  const log = $("log");
  log.prepend(el);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setChip(chipEl, state, label) {
  chipEl.dataset.state = state;
  chipEl.textContent = label;
}

function setPill(pillEl, state, label) {
  pillEl.dataset.state = state;
  pillEl.textContent = label;
}

// -----------------------------
// State
// -----------------------------
let tempTimer = null;
let tempLastC = null;

let camOn = false;

// -----------------------------
// API calls (assumes TLS is enforced by using https endpoints)
// -----------------------------
async function apiGet(url) {
  const res = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { "Accept": "application/json" }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function apiPost(url) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Accept": "application/json" }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${url} failed (${res.status}): ${text}`);
  }
  return res.json();
}

// -----------------------------
// Temperature UI
// Expected backend response example:
//   { "value_c": 24.12, "timestamp": "2026-01-15T17:20:01Z" }
// If your backend returns different field names, adjust parseTempResponse().
// -----------------------------
function parseTempResponse(data) {
  // Try a few common shapes
  if (typeof data?.value_c === "number") return { c: data.value_c, ts: data.timestamp ?? null };
  if (typeof data?.celsius === "number") return { c: data.celsius, ts: data.timestamp ?? null };
  if (typeof data?.temperature_c === "number") return { c: data.temperature_c, ts: data.timestamp ?? null };

  // If it is just a number, treat it as Celsius
  if (typeof data === "number") return { c: data, ts: null };

  throw new Error("Unexpected temperature response shape.");
}

function cToF(c) {
  return (c * 9) / 5 + 32;
}

function renderTemp(c, ts) {
  tempLastC = c;

  const units = $("tempUnits").value;
  let shown = c;
  let unitLabel = "°C";

  if (units === "F") {
    shown = cToF(c);
    unitLabel = "°F";
  }

  $("tempValue").textContent = Number.isFinite(shown) ? shown.toFixed(2) : "—";
  $("tempUnit").textContent = unitLabel;
  $("tempTime").textContent = ts ? String(ts) : nowIso();
}

async function readTemperatureOnce() {
  const data = await apiGet(ENDPOINTS.temperature);
  const { c, ts } = parseTempResponse(data);
  renderTemp(c, ts);
  logLine(`Temperature reading received: ${c.toFixed(2)} °C`, "ok");
}

function startTempPolling() {
  const seconds = Math.max(1, parseInt($("tempInterval").value || "2", 10));
  stopTempPolling();

  setChip($("tempStateChip"), "running", "Running");
  $("btnTempStart").disabled = true;
  $("btnTempStop").disabled = false;

  logLine(`Temperature polling started (every ${seconds}s).`, "info");

  // Immediate read + interval reads
  readTemperatureOnce().catch((e) => {
    logLine(`Temperature read failed: ${e.message}`, "bad");
    setChip($("tempStateChip"), "error", "Error");
  });

  tempTimer = setInterval(() => {
    readTemperatureOnce().catch((e) => {
      logLine(`Temperature read failed: ${e.message}`, "bad");
      setChip($("tempStateChip"), "error", "Error");
    });
  }, seconds * 1000);
}

function stopTempPolling() {
  if (tempTimer) {
    clearInterval(tempTimer);
    tempTimer = null;
  }
  setChip($("tempStateChip"), "stopped", "Stopped");
  $("btnTempStart").disabled = false;
  $("btnTempStop").disabled = true;
  logLine("Temperature polling stopped.", "info");
}

// -----------------------------
// Camera UI
// Backend: POST /power?powerOn=true|false
// Video feed: set <img src="..."> (Mjpeg over HTTPS recommended)
// -----------------------------
function setVideoVisible(visible) {
  const img = $("videoFeed");
  const placeholder = $("videoPlaceholder");
  if (visible) {
    placeholder.style.display = "none";
    img.style.display = "block";
  } else {
    img.style.display = "none";
    placeholder.style.display = "grid";
  }
}

function loadVideoFeed() {
  const url = $("videoUrl").value.trim();
  if (!url) {
    throw new Error("Please enter a video feed URL.");
  }
  if (!url.startsWith("https://")) {
    // keep it strict to match your TLS requirement
    throw new Error("Video feed URL must start with https:// (TLS required).");
  }

  // Bust cache so reload works reliably
  const bust = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  $("videoFeed").src = url + bust;
  setVideoVisible(true);
}

async function setCameraPower(powerOn) {
  const url = `${ENDPOINTS.cameraPower}?powerOn=${powerOn ? "true" : "false"}`;
  const data = await apiPost(url);

  // If your backend returns { powerOn: true/false }, we’ll use it.
  const on = typeof data?.powerOn === "boolean" ? data.powerOn : powerOn;

  camOn = on;

  if (camOn) {
    setChip($("camStateChip"), "on", "On");
    $("btnCamOn").disabled = true;
    $("btnCamOff").disabled = false;
    $("btnCamReload").disabled = false;
    logLine("Camera powered ON.", "ok");

    // Try to load feed if URL provided
    const urlValue = $("videoUrl").value.trim();
    if (urlValue) {
      try {
        loadVideoFeed();
        logLine("Video feed loaded.", "ok");
      } catch (e) {
        logLine(`Camera is on, but feed not loaded: ${e.message}`, "bad");
      }
    }
  } else {
    setChip($("camStateChip"), "off", "Off");
    $("btnCamOn").disabled = false;
    $("btnCamOff").disabled = true;
    $("btnCamReload").disabled = true;
    logLine("Camera powered OFF.", "info");

    // Stop showing feed
    $("videoFeed").src = "";
    setVideoVisible(false);
  }
}

// -----------------------------
// Connection indicator (optional)
// -----------------------------
async function checkHealth() {
  try {
    await apiGet(ENDPOINTS.health);
    setPill($("connPill"), "ok", "Connection: OK");
  } catch {
    setPill($("connPill"), "bad", "Connection: Error");
  }
}

// -----------------------------
// Wire up events
// -----------------------------
window.addEventListener("DOMContentLoaded", () => {
  // Buttons
  $("btnTempStart").addEventListener("click", () => startTempPolling());
  $("
