import { writeFile } from "node:fs/promises";
import https from "node:https";

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

function requestBuffer(url, redirectsRemaining = 3) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        family: 4,
        headers: {
          Accept: "*/*",
          "User-Agent": "weather-lookbook-github-action/1.0",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirectsRemaining <= 0) {
            reject(new Error("APIHub returned too many redirects."));
            return;
          }
          resolve(requestBuffer(new URL(response.headers.location, url), redirectsRemaining - 1));
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            status,
            headers: response.headers,
            buffer: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          });
        });
      },
    );

    request.setTimeout(15_000, () => request.destroy(new Error("APIHub request timed out.")));
    request.on("error", (error) => {
      const detail = error.code ? `${error.message} (${error.code})` : error.message;
      reject(new Error(`APIHub network request failed: ${detail}`));
    });
  });
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

function readUint24(bytes, offset) {
  return bytes[offset] * 65_536 + bytes[offset + 1] * 256 + bytes[offset + 2];
}

function readSignMagnitude16(bytes, offset) {
  const encoded = bytes[offset] * 256 + bytes[offset + 1];
  const magnitude = encoded & 0x7fff;
  return encoded & 0x8000 ? -magnitude : magnitude;
}

function readIbmFloat32(bytes, offset) {
  const sign = bytes[offset] & 0x80 ? -1 : 1;
  const exponent = (bytes[offset] & 0x7f) - 64;
  const fraction =
    (bytes[offset + 1] * 65_536 + bytes[offset + 2] * 256 + bytes[offset + 3]) /
    16_777_216;
  return sign * fraction * 16 ** exponent;
}

function unpackBits(bytes, startOffset, bitWidth, count) {
  if (bitWidth === 0) return Array(count).fill(0);
  const values = [];
  let bitOffset = startOffset * 8;

  for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
    let value = 0;
    for (let bit = 0; bit < bitWidth; bit += 1) {
      const byteIndex = Math.floor(bitOffset / 8);
      const bitIndex = 7 - (bitOffset % 8);
      value = value * 2 + ((bytes[byteIndex] >> bitIndex) & 1);
      bitOffset += 1;
    }
    values.push(value);
  }

  return values;
}

function parseGrib1(buffer) {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.byteLength < 16 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x52 ||
    bytes[2] !== 0x49 ||
    bytes[3] !== 0x42 ||
    bytes[7] !== 1
  ) {
    return null;
  }

  const totalLength = readUint24(bytes, 4);
  if (totalLength > bytes.byteLength) return null;

  let offset = 8;
  const pdsLength = readUint24(bytes, offset);
  if (pdsLength < 28 || offset + pdsLength > totalLength) return null;
  const sectionFlags = bytes[offset + 7];
  const hasGridDefinition = Boolean(sectionFlags & 0x80);
  const hasBitmap = Boolean(sectionFlags & 0x40);
  const decimalScale = readSignMagnitude16(bytes, offset + pdsLength - 2);
  offset += pdsLength;

  if (hasGridDefinition) {
    const gdsLength = readUint24(bytes, offset);
    if (gdsLength < 10 || offset + gdsLength > totalLength) return null;
    const width = bytes[offset + 6] * 256 + bytes[offset + 7];
    const height = bytes[offset + 8] * 256 + bytes[offset + 9];
    if (width !== GRID_WIDTH || height !== GRID_HEIGHT) return null;
    offset += gdsLength;
  }

  let bitmap = null;
  if (hasBitmap) {
    const bmsLength = readUint24(bytes, offset);
    if (bmsLength < 6 || offset + bmsLength > totalLength) return null;
    const bitmapReference = bytes[offset + 4] * 256 + bytes[offset + 5];
    if (bitmapReference !== 0) return null;
    bitmap = unpackBits(bytes, offset + 6, 1, GRID_WIDTH * GRID_HEIGHT);
    offset += bmsLength;
  }

  const bdsLength = readUint24(bytes, offset);
  if (bdsLength < 11 || offset + bdsLength > totalLength) return null;
  const packingFlags = bytes[offset + 3];
  if (packingFlags & 0xc0) return null;
  const binaryScale = readSignMagnitude16(bytes, offset + 4);
  const referenceValue = readIbmFloat32(bytes, offset + 6);
  const bitWidth = bytes[offset + 10];
  const valueCount = bitmap
    ? bitmap.reduce((count, included) => count + included, 0)
    : GRID_WIDTH * GRID_HEIGHT;
  const packedValues = unpackBits(bytes, offset + 11, bitWidth, valueCount);
  const multiplier = 10 ** -decimalScale;
  const decoded = packedValues.map(
    (value) => (referenceValue + value * 2 ** binaryScale) * multiplier,
  );

  if (!bitmap) return decoded;
  let decodedIndex = 0;
  return bitmap.map((included) => (included ? decoded[decodedIndex++] : Number.NaN));
}

function parseGrid(buffer) {
  return parseGrib1(buffer) ?? parseAsciiGrid(buffer) ?? parseBinaryGrid(buffer);
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

  const response = await requestBuffer(url);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`APIHub ${variable} request failed with HTTP ${response.status}.`);
  }

  const values = parseGrid(response.buffer);
  if (!values) {
    const bytes = Buffer.from(response.buffer);
    const type = response.headers["content-type"] ?? "unknown";
    const disposition = response.headers["content-disposition"] ?? "none";
    const magic = bytes.subarray(0, 16).toString("hex");
    throw new Error(
      `APIHub ${variable} returned an unrecognized grid: type=${type}, ` +
        `disposition=${disposition}, bytes=${bytes.byteLength}, magic=${magic}.`,
    );
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
      const values = {};
      for (const variable of VARIABLES) {
        values[variable] = await fetchVariable(authKey, cycle.timestamp, variable);
      }

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
      if (/rejected|HTTP 401|HTTP 403|unrecognized grid|network request failed/i.test(error.message)) {
        throw error;
      }
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