import { writeFile } from "node:fs/promises";

const API_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_odam_grd";
const OUTPUT_URL = new URL("../weather.json", import.meta.url);
const GRID_WIDTH = 149;
const GRID_HEIGHT = 253;
const LOCATION = {
  name: "Seongsu-dong, Seoul",
  latitude: 37.5446,
  longitude: 127.0557,
  nx: 61,
  ny: 126,
};
const VARIABLES = ["T1H", "PTY", "RN1", "REH"];

function formatKoreaCycle(now = new Date(), cyclesAgo = 0) {
  const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 5 * 60 * 1000);
  koreaTime.setUTCMinutes(
    Math.floor(koreaTime.getUTCMinutes() / 10) * 10 - cyclesAgo * 10,
    0,
    0,
  );

  const yyyy = String(koreaTime.getUTCFullYear());
  const mm = String(koreaTime.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(koreaTime.getUTCDate()).padStart(2, "0");
  const hh = String(koreaTime.getUTCHours()).padStart(2, "0");
  const minute = String(koreaTime.getUTCMinutes()).padStart(2, "0");
  return {
    timestamp: `${yyyy}${mm}${dd}${hh}${minute}`,
    baseDate: `${yyyy}${mm}${dd}`,
    baseTime: `${hh}${minute}`,
  };
}

function parseAsciiGrid(buffer) {
  const text = new TextDecoder().decode(buffer);
  if (/(unauthorized|forbidden|authentication|authkey|인증|오류|error)/i.test(text)) {
    throw new Error(`APIHub rejected the request: ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`);
  }

  const numbers = (text.match(/[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/g) ?? []).map(Number);
  const valueCount = GRID_WIDTH * GRID_HEIGHT;

  for (let index = 0; index < Math.min(numbers.length - 1, 100); index += 1) {
    if (
      numbers[index] === GRID_WIDTH &&
      numbers[index + 1] === GRID_HEIGHT &&
      numbers.length >= index + 2 + valueCount
    ) {
      return numbers.slice(index + 2, index + 2 + valueCount);
    }
  }

  if (numbers.length === valueCount) return numbers;
  return null;
}

function parseBinaryGrid(buffer) {
  const valueCount = GRID_WIDTH * GRID_HEIGHT;
  if (buffer.byteLength < 4 + valueCount * 4) return null;
  const view = new DataView(buffer);

  for (const littleEndian of [true, false]) {
    if (
      view.getInt16(0, littleEndian) === GRID_WIDTH &&
      view.getInt16(2, littleEndian) === GRID_HEIGHT
    ) {
      return Array.from(
        { length: valueCount },
        (_, index) => view.getFloat32(4 + index * 4, littleEndian),
      );
    }
  }

  return null;
}

function parseGrid(buffer) {
  return parseAsciiGrid(buffer) ?? parseBinaryGrid(buffer);
}

function gridValue(values) {
  const index = (LOCATION.ny - 1) * GRID_WIDTH + (LOCATION.nx - 1);
  return Number(values[index]);
}

async function fetchVariable(authKey, timestamp, variable) {
  const url = new URL(API_URL);
  url.search = new URLSearchParams({
    tmfc: timestamp,
    vars: variable,
    authKey: authKey.trim(),
  }).toString();

  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(`APIHub ${variable} request failed with HTTP ${response.status}.`);
  }

  const values = parseGrid(buffer);
  if (!values) {
    throw new Error(`APIHub ${variable} response was not a recognized 149x253 grid.`);
  }

  return gridValue(values);
}

function normalizePrecipitation(code) {
  if (code === 0) return "none";
  if ([2, 3, 6, 7].includes(code)) return "snow";
  return "rain";
}

function isValidObservation(values) {
  return Number.isFinite(values.T1H) &&
    values.T1H > -80 &&
    values.T1H < 60 &&
    Number.isInteger(values.PTY) &&
    values.PTY >= 0 &&
    values.PTY <= 7 &&
    Number.isFinite(values.RN1) &&
    values.RN1 >= 0 &&
    Number.isFinite(values.REH) &&
    values.REH >= 0 &&
    values.REH <= 100;
}

async function fetchCurrentWeather(authKey) {
  let lastError;

  for (let cyclesAgo = 0; cyclesAgo < 6; cyclesAgo += 1) {
    const cycle = formatKoreaCycle(new Date(), cyclesAgo);
    try {
      const results = await Promise.all(
        VARIABLES.map(async (variable) => [variable, await fetchVariable(authKey, cycle.timestamp, variable)]),
      );
      const values = Object.fromEntries(results);
      if (!isValidObservation(values)) {
        throw new Error(`APIHub ${cycle.timestamp} grid did not contain a valid Seongsu observation.`);
      }

      return {
        temperature: values.T1H,
        humidity: values.REH,
        precipitationType: normalizePrecipitation(values.PTY),
        precipitationAmount: values.RN1,
        precipitationCode: values.PTY,
        baseDate: cycle.baseDate,
        baseTime: cycle.baseTime,
        nx: LOCATION.nx,
        ny: LOCATION.ny,
      };
    } catch (error) {
      lastError = error;
      if (/rejected|HTTP 401|HTTP 403/i.test(error.message)) throw error;
    }
  }

  throw lastError ?? new Error("APIHub did not provide a recent 10-minute observation.");
}

async function main() {
  const authKey = process.env.KMA_APIHUB_KEY;
  if (!authKey) throw new Error("KMA_APIHUB_KEY is not configured.");

  const weather = await fetchCurrentWeather(authKey);
  const published = {
    ...weather,
    locationName: LOCATION.name,
    source: "kma-apihub-10-minute-observation",
    generatedAt: new Date().toISOString(),
  };

  await writeFile(OUTPUT_URL, `${JSON.stringify(published, null, 2)}\n`, "utf8");
  console.log(
    `Published APIHub weather for ${LOCATION.name}: ${weather.baseDate} ${weather.baseTime}, ` +
      `${weather.temperature}C, PTY ${weather.precipitationCode}, RN1 ${weather.precipitationAmount}mm.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});