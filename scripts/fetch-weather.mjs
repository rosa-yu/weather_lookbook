import { writeFile } from "node:fs/promises";

const API_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
const OUTPUT_URL = new URL("../weather.json", import.meta.url);
const LOCATION = {
  name: "Seongsu-dong, Seoul",
  latitude: 37.5446,
  longitude: 127.0557,
};

function toKmaGrid(latitude, longitude) {
  const RE = 6371.00877;
  const GRID = 5.0;
  const SLAT1 = 30.0;
  const SLAT2 = 60.0;
  const OLON = 126.0;
  const OLAT = 38.0;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + latitude * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = longitude * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

function getKmaBaseTime(now = new Date()) {
  const koreaNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const base = new Date(koreaNow);
  base.setUTCMinutes(0, 0, 0);
  if (koreaNow.getUTCMinutes() < 45) base.setUTCHours(base.getUTCHours() - 1);

  const yyyy = String(base.getUTCFullYear());
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  const hh = String(base.getUTCHours()).padStart(2, "0");
  return { baseDate: `${yyyy}${mm}${dd}`, baseTime: `${hh}00` };
}

function normalizePrecipitation(value) {
  const code = String(value ?? "0");
  if (code === "0") return "none";
  if (code === "3" || code === "7") return "snow";
  return "rain";
}

function decodeServiceKey(value) {
  const trimmed = value.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

async function fetchCurrentWeather(serviceKey) {
  const { nx, ny } = toKmaGrid(LOCATION.latitude, LOCATION.longitude);
  const { baseDate, baseTime } = getKmaBaseTime();
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    serviceKey: decodeServiceKey(serviceKey),
    pageNo: "1",
    numOfRows: "20",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  }).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error(`KMA request failed with HTTP ${response.status}.`);

  const data = await response.json();
  const resultCode = data?.response?.header?.resultCode;
  const resultMessage = data?.response?.header?.resultMsg;
  if (resultCode && resultCode !== "00") {
    throw new Error(`KMA returned ${resultCode}: ${resultMessage || "unknown error"}.`);
  }

  const items = data?.response?.body?.items?.item;
  if (!Array.isArray(items)) throw new Error("KMA response did not include observation items.");

  const byCategory = Object.fromEntries(items.map((item) => [item.category, item.obsrValue]));
  const temperature = Number(byCategory.T1H);
  const humidity = Number(byCategory.REH);
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
    throw new Error("KMA response did not include valid temperature and humidity values.");
  }

  return {
    temperature,
    humidity,
    precipitationType: normalizePrecipitation(byCategory.PTY),
    baseDate,
    baseTime,
    nx,
    ny,
  };
}

async function main() {
  const serviceKey = process.env.WEATHER_SECRET_KEY;
  if (!serviceKey) throw new Error("WEATHER_SECRET_KEY is not configured.");

  const weather = await fetchCurrentWeather(serviceKey);
  const published = {
    ...weather,
    locationName: LOCATION.name,
    source: "kma-ultra-short-observation",
    generatedAt: new Date().toISOString(),
  };

  await writeFile(OUTPUT_URL, `${JSON.stringify(published, null, 2)}\n`, "utf8");
  console.log(`Published KMA weather snapshot for ${LOCATION.name}: ${weather.baseDate} ${weather.baseTime}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
