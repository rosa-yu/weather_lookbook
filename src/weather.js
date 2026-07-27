const PUBLISHED_WEATHER_URL = new URL("../weather.json", import.meta.url);
const PRECIPITATION_TYPES = new Set(["none", "rain", "snow"]);

export async function fetchPublishedWeather() {
  const url = new URL(PUBLISHED_WEATHER_URL);
  url.searchParams.set("_", String(Date.now()));

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Published weather request failed: ${response.status}`);

  const data = await response.json();
  const temperature = Number(data.temperature);
  const humidity = Number(data.humidity);
  const precipitationAmount = Number(data.precipitationAmount ?? 0);
  if (
    !Number.isFinite(temperature) ||
    !Number.isFinite(humidity) ||
    !Number.isFinite(precipitationAmount)
  ) {
    throw new Error("Published weather contains invalid numeric values.");
  }
  if (!PRECIPITATION_TYPES.has(data.precipitationType)) {
    throw new Error("Published weather contains an invalid precipitation type.");
  }

  return {
    ...data,
    temperature,
    humidity,
    precipitationAmount,
  };
}