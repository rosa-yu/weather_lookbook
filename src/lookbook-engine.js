const MANIFEST_URL = new URL("../assets/lookbook-videos/manifest.json", import.meta.url);
const STORAGE_PREFIX = "weather-lookbook-shuffle-v1:";
const memoryStorage = new Map();

function monthDayValue(monthDay) {
  const [month, day] = monthDay.split("-").map(Number);
  return month * 100 + day;
}

function dateMonthDayValue(date) {
  return (date.getMonth() + 1) * 100 + date.getDate();
}

export function isDateInPeriod(date, start, end) {
  const value = dateMonthDayValue(date);
  const startValue = monthDayValue(start);
  const endValue = monthDayValue(end);
  return startValue <= endValue
    ? value >= startValue && value <= endValue
    : value >= startValue || value <= endValue;
}

export function precipitationCategory(weather) {
  const code = Number(weather.precipitationCode);
  if (Number.isFinite(code)) {
    if (code === 0) return "none";
    if (code === 3 || code === 7) return "snow";
    return "rain-or-sleet";
  }

  if (weather.precipitationType === "snow") return "snow";
  if (weather.precipitationType === "rain") return "rain-or-sleet";
  return "none";
}

function inRange(value, match) {
  return (match.min === undefined || value >= match.min) &&
    (match.max === undefined || value < match.max);
}

export function conditionMatches(condition, weather) {
  const match = condition.match;
  const category = precipitationCategory(weather);

  if (match.kind === "temperature") {
    return category === "none" && inRange(Number(weather.temperature), match);
  }

  if (match.kind === "precipitationAmount") {
    return category !== "none" && inRange(Number(weather.precipitationAmount ?? 0), match);
  }

  if (match.kind === "precipitationCategory") {
    return category === match.category;
  }

  return false;
}

export function selectScheduledLookbook(manifest, weather, date = new Date()) {
  const period = manifest?.periods?.find((candidate) =>
    isDateInPeriod(date, candidate.start, candidate.end),
  );
  if (!period) return null;

  const precipitationConditions = period.conditions.filter(
    (condition) => condition.match.kind !== "temperature",
  );
  const temperatureConditions = period.conditions.filter(
    (condition) => condition.match.kind === "temperature",
  );
  const condition = [...precipitationConditions, ...temperatureConditions].find((candidate) =>
    conditionMatches(candidate, weather),
  );
  if (!condition) return null;

  return {
    period,
    condition,
    poolKey: `${period.id}/${condition.id}`,
  };
}

export async function fetchLookbookManifest() {
  const url = new URL(MANIFEST_URL);
  url.searchParams.set("_", String(Date.now()));
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Lookbook manifest request failed: ${response.status}`);
  return response.json();
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function readStoredState(storageKey, storage) {
  if (typeof storage?.getItem !== "function") {
    return memoryStorage.get(storageKey) ?? null;
  }
  try {
    const value = storage.getItem(storageKey);
    return value ? JSON.parse(value) : null;
  } catch {
    return memoryStorage.get(storageKey) ?? null;
  }
}

function writeStoredState(storageKey, state, storage) {
  if (typeof storage?.setItem !== "function") {
    memoryStorage.set(storageKey, state);
    return;
  }
  try {
    storage.setItem(storageKey, JSON.stringify(state));
  } catch {
    memoryStorage.set(storageKey, state);
  }
}

export function takeNextVideo(poolKey, videos, options = {}) {
  if (!Array.isArray(videos) || videos.length === 0) return null;
  const storage = options.storage ?? globalThis.localStorage;
  const random = options.random ?? Math.random;
  const storageKey = `${STORAGE_PREFIX}${poolKey}`;
  const signature = [...videos].sort().join("\u0000");
  let state = readStoredState(storageKey, storage);

  if (!state || state.signature !== signature || !Array.isArray(state.queue)) {
    state = { signature, queue: [], lastPlayed: null };
  }

  state.queue = state.queue.filter((video) => videos.includes(video));
  if (state.queue.length === 0) {
    state.queue = shuffle(videos, random);
    if (state.queue.length > 1 && state.queue[0] === state.lastPlayed) {
      [state.queue[0], state.queue[1]] = [state.queue[1], state.queue[0]];
    }
  }

  const nextVideo = state.queue.shift();
  state.lastPlayed = nextVideo;
  writeStoredState(storageKey, state, storage);
  return nextVideo;
}