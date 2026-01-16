// -------------------------------------------------------------
// CONFIGURATION - v1.0.1
// -------------------------------------------------------------

// If true, no backend is required; the UI generates mock data in the browser.
// If false, the UI calls the FastAPI backend endpoints.
const USE_SIMULATION_MODE = false;

// When the UI is served by the same FastAPI app, keep this empty so fetch()
// hits the same host:port as the page itself.
const API_BASE = "";

const ENDPOINTS = {
  temperature: `${API_BASE}/temperature`,
  cameraPower: `${API_BASE}/power`,
  health: `${API_BASE}/health`,
};

// -------------------------------------------------------------
// DOM helpers
// -------------------------------------------------------------
const $ = (id) => document.getElementById(id);

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logLine(message, level = "info") {
  const el = document.createElement("div");
  el.className = "line";
  el.innerHTML = `<span class="ts">${nowIso().split("T")[1].split(".")[0]}</span><span class="${level}">${escapeHtml(message)}</span>`;
  const log = $("log");
  log.prepend(el);
}

function setChip(chipEl, state, label) {
  chipEl.dataset.state = state;
  chipEl.textContent = label;
}

function setPill(pillEl, state, label) {
  pillEl.dataset.state = state;
  pillEl.textContent = label;
}

// -------------------------------------------------------------
// MOCK SERVER LOGIC (Simulation Mode)
// -------------------------------------------------------------
let simTemp = 22.0;

function getMockTemperature() {
  const delta = (Math.random() - 0.5) * 1.5;
  simTemp += delta;
  if (simTemp > 35) simTemp -= 1.0;
  if (simTemp < 10) simTemp += 1.0;

  return { value_c: simTemp, timestamp: nowIso() };
}

async function mockNetworkDelay() {
  return new Promise((r) => setTimeout(r, 400));
}

// -------------------------------------------------------------
// API WRAPPERS
// -------------------------------------------------------------
async function apiGet(url) {
  if (USE_SIMULATION_MODE) {
    await mockNetworkDelay();
    if (url.includes("temperature")) return getMockTemperature();
    if (url.includes("health")) return { status: "ok" };
    throw new Error("404 Not Found (Mock)");
  }

  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET error ${res.status}`);
  return res.json();
}

async function apiPost(url) {
  if (USE_SIMULATION_MODE) {
    await mockNetworkDelay();
    const urlObj = new URL(url, window.location.origin);
    const powerOn = urlObj.searchParams.get("powerOn") === "true";
    return { powerOn };
  }

  const res = await fetch(url, { method: "POST", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`POST error ${res.status}`);
  return res.json();
}

// -------------------------------------------------------------
// TEMPERATURE LOGIC
// -------------------------------------------------------------
let tempTimer = null;

function cToF(c) {
  return (c * 9) / 5 + 32;
}

function parseTempResponse(data) {
  if (typeof data?.value_c === "number") return { c: data.value_c, ts: data.timestamp };
  if (typeof data?.temperature_c === "number") return { c: data.temperature_c, ts: data.timestamp };
  if (typeof data === "number") return { c: data, ts: null };
  throw new Error("Invalid temp data format");
}

function renderTemp(c, ts) {
  const units = $("tempUnits").value;
  let shown = c;
  let unitLabel = "°C";

  if (units === "F") {
    shown = cToF(c);
    unitLabel = "°F";
  }

  $("tempValue").textContent = Number.isFinite(shown) ? shown.toFixed(2) : "—";
  $("tempUnit").textContent = unitLabel;
  $("tempTime").textContent = ts ? ts.split("T")[1].replace("Z", "") : "--:--:--";
}

async function readTemperatureOnce() {
  try {
    const data = await apiGet(ENDPOINTS.temperature);
    const { c, ts } = parseTempResponse(data);
    renderTemp(c, ts);
    logLine(`Read: ${c.toFixed(2)} °C`, "ok");
  } catch (e) {
    logLine(`Temp Error: ${e.message}`, "bad");
    setChip($("tempStateChip"), "error", "Error");
  }
}

function startTempPolling() {
  const seconds = Math.max(1, parseInt($("tempInterval").value || "2", 10));
  stopTempPolling();

  setChip($("tempStateChip"), "running", "Running");
  $("btnTempStart").disabled = true;
  $("btnTempStop").disabled = false;
  logLine(`Polling started (${seconds}s).`, "info");

  readTemperatureOnce();
  tempTimer = setInterval(readTemperatureOnce, seconds * 1000);
}

function stopTempPolling() {
  if (tempTimer) {
    clearInterval(tempTimer);
    tempTimer = null;
  }
  setChip($("tempStateChip"), "stopped", "Stopped");
  $("btnTempStart").disabled = false;
  $("btnTempStop").disabled = true;
  logLine("Polling stopped.", "info");
}

// -------------------------------------------------------------
// CAMERA LOGIC (still stubbed)
// -------------------------------------------------------------
let camOn = false;

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

async function setCameraPower(powerOn) {
  try {
    const url = `${ENDPOINTS.cameraPower}?powerOn=${powerOn}`;
    const data = await apiPost(url);
    camOn = data.powerOn;

    if (camOn) {
      setChip($("camStateChip"), "on", "On");
      $("btnCamOn").disabled = true;
      $("btnCamOff").disabled = false;
      $("btnCamReload").disabled = false;
      logLine("Camera ON", "ok");

      const urlVal = $("videoUrl").value.trim();
      if (urlVal) {
        $("videoFeed").src = urlVal;
        setVideoVisible(true);
      } else {
        logLine("No video URL set. Enter a feed URL to display.", "info");
      }
    } else {
      setChip($("camStateChip"), "off", "Off");
      $("btnCamOn").disabled = false;
      $("btnCamOff").disabled = true;
      $("btnCamReload").disabled = true;
      logLine("Camera OFF", "info");
      setVideoVisible(false);
      $("videoFeed").src = "";
    }
  } catch (e) {
    logLine(`Cam Error: ${e.message}`, "bad");
  }
}

// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  $("btnTempStart").addEventListener("click", startTempPolling);
  $("btnTempStop").addEventListener("click", stopTempPolling);
  $("btnTempOnce").addEventListener("click", readTemperatureOnce);

  $("btnCamOn").addEventListener("click", () => setCameraPower(true));
  $("btnCamOff").addEventListener("click", () => setCameraPower(false));
  $("btnCamReload").addEventListener("click", () => {
    const urlVal = $("videoUrl").value.trim();
    if (urlVal) $("videoFeed").src = urlVal + (urlVal.includes("?") ? "&" : "?") + "t=" + Date.now();
  });

  $("btnClearLog").addEventListener("click", () => ($("log").innerHTML = ""));

  apiGet(ENDPOINTS.health)
    .then(() => setPill($("connPill"), "ok", "Connection: OK"))
    .catch(() => setPill($("connPill"), "bad", "Offline"));

  if (USE_SIMULATION_MODE) {
    logLine("Simulation Mode Active. No backend required.", "info");
    setPill($("connPill"), "ok", "Simulated OK");
  }
});

