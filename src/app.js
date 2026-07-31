import { fetchPublishedWeather } from "./weather.js";
import {
  fetchLookbookManifest,
  selectScheduledLookbook,
  takeNextVideo,
} from "./lookbook-engine.js";

const CONDITIONS = [
  { id: "very-hot", icon: "clear", temp: 35, label: "Very Hot", look: "Air Shorts + Mesh Tee" },
  { id: "hot", icon: "clear", temp: 30, label: "Hot", look: "Linen Shirt + Cotton Pants" },
  { id: "mild", icon: "clear", temp: 22, label: "Mild", look: "KOMATSU Pants + Light Shirt" },
  { id: "cool", icon: "clouds", temp: 16, label: "Cool", look: "Light Jacket + Long Sleeve" },
  { id: "cold", icon: "cold", temp: 8, label: "Cold", look: "Wool Coat + Knit Layer" },
  { id: "very-cold", icon: "cold", temp: 1, label: "Very Cold", look: "Padded Coat + Rib Knit" },
  { id: "freezing", icon: "cold", temp: -9, label: "Freezing", look: "Down Blouson + Heat Knit" },
  { id: "light-rain", icon: "rain", temp: 17, label: "Light Rain", look: "Coated Parka + Tapered Pants" },
  { id: "heavy-rain", icon: "rain", temp: 15, label: "Heavy Rain", look: "Rain Shell + Waterproof Pants" },
  { id: "snow", icon: "snow", temp: -2, label: "Snow", look: "Wool Coat + Rib Knit Layer" },
];

const FALLBACK_WEATHER = {
  temperature: 22,
  humidity: 55,
  precipitationType: "none",
  precipitationAmount: 0,
  precipitationCode: 0,
  baseTime: "--",
};
const FALLBACK_VIDEO = "./assets/display/KOMATSU Pants + Light Shirt.mp4";
const HEAVY_RAIN_THRESHOLD_MM_PER_HOUR = 10;
const LOOKBOOK_TEST_PRESETS = {
  "very-hot": {
    label: "Very Hot",
    date: "2026-08-14",
    weather: { temperature: 34, precipitationType: "none", precipitationAmount: 0, precipitationCode: 0 },
  },
  hot: {
    label: "Hot",
    date: "2026-08-14",
    weather: { temperature: 32, precipitationType: "none", precipitationAmount: 0, precipitationCode: 0 },
  },
  "relatively-cool": {
    label: "Relatively Cool",
    date: "2026-08-14",
    weather: { temperature: 31, precipitationType: "none", precipitationAmount: 0, precipitationCode: 0 },
  },
  "light-rain": {
    label: "Light Rain",
    date: "2026-08-14",
    weather: { temperature: 26, precipitationType: "rain", precipitationAmount: 1, precipitationCode: 1 },
  },
  "heavy-rain": {
    label: "Heavy Rain",
    date: "2026-08-14",
    weather: { temperature: 26, precipitationType: "rain", precipitationAmount: 10, precipitationCode: 1 },
  },
};

const elements = {
  date: document.querySelector("#dateText"),
  time: document.querySelector("#timeText"),
  icon: document.querySelector("#weatherIcon"),
  temperature: document.querySelector("#temperature"),
  condition: document.querySelector("#conditionLabel"),
  look: document.querySelector("#lookTitle"),
  switcher: document.querySelector("#conditionSwitcher"),
  status: document.querySelector("#statusMessage"),
  video: document.querySelector("#lookbookVideo"),
};

let lookbookManifest = null;
let activePool = null;
let activeVideoPath = null;
let failedVideos = new Set();
let playbackUnlockInstalled = false;

function updateClock() {
  const now = new Date();
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const pad = (value) => String(value).padStart(2, "0");
  const hours = now.getHours();
  const displayHour = hours % 12 || 12;
  const period = hours < 12 ? "AM" : "PM";

  elements.date.textContent =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${days[now.getDay()]}`;
  elements.date.dateTime = now.toISOString();
  elements.time.textContent = `${period} ${pad(displayHour)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  elements.time.dateTime = now.toISOString();
}

function getTestWeather() {
  const override = window.__WEATHER_LOOKBOOK_OVERRIDE__;
  if (!override?.enabled) return null;

  return {
    temperature: Number(override.temperature),
    humidity: Number(override.humidity ?? FALLBACK_WEATHER.humidity),
    precipitationType: override.precipitationType ?? "none",
    precipitationAmount: Number(override.precipitationAmount ?? 0),
    precipitationCode: Number(override.precipitationCode ?? Number.NaN),
    baseTime: override.baseTime ?? "1200",
  };
}

function localDateFromIso(dateText) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getUrlTestContext() {
  const presetId = new URLSearchParams(window.location.search).get("lookbookTest");
  const preset = LOOKBOOK_TEST_PRESETS[presetId];
  if (!preset) return null;

  return {
    date: localDateFromIso(preset.date),
    weather: {
      ...FALLBACK_WEATHER,
      ...preset.weather,
      baseDate: preset.date.replaceAll("-", ""),
      baseTime: "1200",
    },
    message: `TEST ${preset.date} · ${preset.label}.`,
  };
}
function selectFallbackCondition(weather) {
  if (weather.precipitationType === "snow") return CONDITIONS[9];
  if (weather.precipitationType === "rain") {
    return Number(weather.precipitationAmount) >= HEAVY_RAIN_THRESHOLD_MM_PER_HOUR
      ? CONDITIONS[8]
      : CONDITIONS[7];
  }

  const temperature = Number(weather.temperature);
  if (temperature >= 33) return CONDITIONS[0];
  if (temperature >= 27) return CONDITIONS[1];
  if (temperature >= 19) return CONDITIONS[2];
  if (temperature >= 13) return CONDITIONS[3];
  if (temperature >= 5) return CONDITIONS[4];
  if (temperature >= -3) return CONDITIONS[5];
  return CONDITIONS[6];
}

function scheduledPresentation(selection, weather) {
  if (!selection) return selectFallbackCondition(weather);
  return {
    id: `scheduled:${selection.poolKey}`,
    icon: selection.condition.icon,
    temp: Number(weather.temperature),
    label: selection.condition.labelEn,
    look: selection.condition.labelKo,
  };
}

function renderCondition(condition, temperature = condition.temp) {
  elements.temperature.textContent = Number.isFinite(Number(temperature))
    ? String(Math.round(Number(temperature)))
    : "--";
  elements.condition.textContent = condition.label;
  elements.look.textContent = condition.look;
  elements.icon.innerHTML = weatherIcon(condition.icon);

  elements.switcher.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.condition === condition.id));
  });
}

function renderSwitcher() {
  const fragment = document.createDocumentFragment();

  CONDITIONS.forEach((condition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.condition = condition.id;
    button.title = condition.label;
    button.setAttribute("aria-label", `Preview ${condition.label}`);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      renderCondition(condition);
      renderVideoTitle(activeVideoPath);
      setStatus(`Previewing ${condition.label}.`);
    });
    fragment.append(button);
  });

  elements.switcher.append(fragment);
}

function setStatus(message) {
  elements.status.textContent = message;
  elements.status.dataset.ready = "true";
}

function videoDisplayName(videoPath) {
  const cleanPath = String(videoPath ?? "").split(/[?#]/)[0];
  const encodedFileName = cleanPath.split("/").pop() ?? "";
  let fileName = encodedFileName;
  try {
    fileName = decodeURIComponent(encodedFileName);
  } catch {
    // Keep the original path segment if it contains malformed URL encoding.
  }
  return fileName.replace(/\.(mp4|webm)$/i, "") || "LOOKBOOK";
}

function renderVideoTitle(videoPath) {
  if (!videoPath) return;
  const title = videoDisplayName(videoPath);
  elements.look.textContent = title;
  elements.look.title = title;
  elements.video.setAttribute("aria-label", `${title} lookbook video`);
}

function requestPlayback() {
  elements.video.play().catch(() => {
    if (playbackUnlockInstalled) return;
    playbackUnlockInstalled = true;
    document.addEventListener(
      "pointerdown",
      () => {
        playbackUnlockInstalled = false;
        elements.video.play().catch(() => {});
      },
      { once: true },
    );
  });
}

function playNextInCycle() {
  if (!activePool) return;
  const availableVideos = activePool.videos.filter((video) => !failedVideos.has(video));
  if (availableVideos.length === 0) {
    if (activeVideoPath !== FALLBACK_VIDEO) {
      activeVideoPath = FALLBACK_VIDEO;
      renderVideoTitle(FALLBACK_VIDEO);
      elements.video.src = FALLBACK_VIDEO;
      elements.video.load();
      requestPlayback();
    }
    return;
  }

  const nextVideo = takeNextVideo(activePool.poolKey, availableVideos);
  if (!nextVideo) return;
  activeVideoPath = nextVideo;
  renderVideoTitle(nextVideo);
  elements.video.src = nextVideo;
  elements.video.load();
  requestPlayback();
}

function activateLookbookPool(selection) {
  const registeredVideos = selection?.condition?.videos ?? [];
  const usesRegisteredVideos = registeredVideos.length > 0;
  const videos = usesRegisteredVideos
    ? registeredVideos
    : [lookbookManifest?.fallbackVideo ?? FALLBACK_VIDEO];
  const poolKey = usesRegisteredVideos
    ? selection.poolKey
    : `fallback:${selection?.poolKey ?? "out-of-schedule"}`;
  const signature = videos.join("\u0000");

  if (activePool?.poolKey === poolKey && activePool.signature === signature) {
    renderVideoTitle(activeVideoPath);
    return;
  }
  activePool = { poolKey, signature, videos };
  failedVideos = new Set();
  playNextInCycle();
}

async function refreshLookbookManifest() {
  try {
    lookbookManifest = await fetchLookbookManifest();
  } catch (error) {
    console.warn(error);
  }
}

function applyWeather(weather, sourceMessage, date = new Date()) {
  const selection = selectScheduledLookbook(lookbookManifest, weather, date);
  renderCondition(scheduledPresentation(selection, weather), weather.temperature);
  activateLookbookPool(selection);

  if (selection && selection.condition.videos.length === 0) {
    setStatus(`${sourceMessage} ${selection.poolKey} has no registered video; displaying fallback.`);
  } else if (selection) {
    setStatus(`${sourceMessage} Playing shuffle cycle ${selection.poolKey}.`);
  } else {
    setStatus(`${sourceMessage} No seasonal rule for today; displaying fallback lookbook.`);
  }
}

async function loadWeather() {
  await refreshLookbookManifest();
  const urlTestContext = getUrlTestContext();
  if (urlTestContext) {
    applyWeather(urlTestContext.weather, urlTestContext.message, urlTestContext.date);
    return;
  }

  const testWeather = getTestWeather();
  if (testWeather) {
    applyWeather(testWeather, "Displaying the GitHub Environment test weather.");
    return;
  }

  try {
    const weather = await fetchPublishedWeather();
    applyWeather(weather, "Updated from the private GitHub Actions weather snapshot.");
  } catch (error) {
    console.warn(error);
    applyWeather(FALLBACK_WEATHER, `Displaying fallback weather. ${error.message}`);
  }
}

function weatherIcon(type) {
  const svgOpen =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  const svgClose = "</svg>";
  const cloud = '<path d="M17.5 18h-9a5 5 0 0 1-.6-9.97A6 6 0 0 1 19 9.5a4.25 4.25 0 0 1-1.5 8.5z"/>';

  if (type === "clear") {
    const rays = [
      "M12 1.8v2.3", "M12 19.9v2.3", "M1.8 12h2.3", "M19.9 12h2.3",
      "M4.8 4.8l1.6 1.6", "M17.6 17.6l1.6 1.6", "M19.2 4.8l-1.6 1.6", "M6.4 17.6l-1.6 1.6",
    ].map((path, index) => `<path class="ray" style="animation-delay:${index * 0.08}s" d="${path}"/>`).join("");
    return `${svgOpen}<circle cx="12" cy="12" r="4.2"/>${rays}${svgClose}`;
  }

  if (type === "rain") {
    const drops = [
      '<line class="rain-drop" x1="8" y1="19" x2="7.2" y2="22"/>',
      '<line class="rain-drop" style="animation-delay:.3s" x1="12" y1="19" x2="11.2" y2="22"/>',
      '<line class="rain-drop" style="animation-delay:.6s" x1="16" y1="19" x2="15.2" y2="22"/>',
    ].join("");
    return `${svgOpen}${cloud}${drops}${svgClose}`;
  }

  if (type === "snow") {
    const flakes = [
      '<path class="snow-flake" d="M7.5 19v3m-1.3-2.3 2.6 1.6m0-1.6-2.6 1.6"/>',
      '<path class="snow-flake" style="animation-delay:.45s" d="M15.5 19v3m-1.3-2.3 2.6 1.6m0-1.6-2.6 1.6"/>',
    ].join("");
    return `${svgOpen}${cloud}${flakes}${svgClose}`;
  }

  if (type === "cold") return `${svgOpen}${cloud}<path d="M8 20h8M10 22h4"/>${svgClose}`;
  return `${svgOpen}${cloud}${svgClose}`;
}

renderSwitcher();
updateClock();
setInterval(updateClock, 1000);
loadWeather();
setInterval(loadWeather, 10 * 60 * 1000);

elements.video.addEventListener("ended", playNextInCycle);
elements.video.addEventListener("error", () => {
  if (!activeVideoPath || activeVideoPath === FALLBACK_VIDEO) return;
  failedVideos.add(activeVideoPath);
  playNextInCycle();
});