import assert from "node:assert/strict";
import test from "node:test";
import { LOOKBOOK_SCHEDULE } from "../src/lookbook-schedule.js";
import {
  isDateInPeriod,
  precipitationCategory,
  selectScheduledLookbook,
  takeNextVideo,
} from "../src/lookbook-engine.js";

const manifest = {
  periods: LOOKBOOK_SCHEDULE.map((period) => ({
    ...period,
    conditions: period.conditions.map((condition) => ({ ...condition, videos: [] })),
  })),
};

function weather(overrides = {}) {
  return {
    temperature: 22,
    precipitationType: "none",
    precipitationAmount: 0,
    precipitationCode: 0,
    ...overrides,
  };
}

class TestStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, value); }
}

test("cross-year date ranges include both sides of New Year", () => {
  assert.equal(isDateInPeriod(new Date(2026, 11, 31), "11-30", "01-03"), true);
  assert.equal(isDateInPeriod(new Date(2027, 0, 3), "11-30", "01-03"), true);
  assert.equal(isDateInPeriod(new Date(2027, 0, 4), "11-30", "01-03"), false);
});

test("Aug 14 temperature boundaries are 32 and 34 degrees", () => {
  const date = new Date(2026, 7, 14, 12);
  const selectTemperature = (temperature) =>
    selectScheduledLookbook(manifest, weather({ temperature }), date);

  assert.equal(selectTemperature(34).condition.id, "01-very-hot");
  assert.equal(selectTemperature(33.9).condition.id, "02-hot");
  assert.equal(selectTemperature(32).condition.id, "02-hot");
  assert.equal(selectTemperature(31.9).condition.id, "03-relatively-cool");
});

test("Aug 28 temperature boundaries are 30 and 32 degrees with the existing rain split", () => {
  const date = new Date(2026, 7, 28, 12);
  const selectTemperature = (temperature) =>
    selectScheduledLookbook(manifest, weather({ temperature }), date);

  assert.equal(selectTemperature(32).condition.id, "01-late-heat");
  assert.equal(selectTemperature(31.9).condition.id, "02-cool");
  assert.equal(selectTemperature(30).condition.id, "02-cool");
  assert.equal(selectTemperature(29.9).condition.id, "03-chilly");
  assert.equal(
    selectScheduledLookbook(
      manifest,
      weather({ precipitationType: "rain", precipitationCode: 1, precipitationAmount: 9.9 }),
      date,
    ).condition.id,
    "04-light-rain",
  );
  assert.equal(
    selectScheduledLookbook(
      manifest,
      weather({ precipitationType: "rain", precipitationCode: 1, precipitationAmount: 10 }),
      date,
    ).condition.id,
    "05-heavy-rain",
  );
});

test("10 mm/h is the exact heavy-rain boundary", () => {
  const date = new Date(2026, 7, 20, 12);
  const light = selectScheduledLookbook(
    manifest,
    weather({ precipitationType: "rain", precipitationCode: 1, precipitationAmount: 9.9 }),
    date,
  );
  const heavy = selectScheduledLookbook(
    manifest,
    weather({ precipitationType: "rain", precipitationCode: 1, precipitationAmount: 10 }),
    date,
  );
  assert.equal(light.condition.id, "04-light-rain");
  assert.equal(heavy.condition.id, "05-heavy-rain");
});

test("winter PTY codes distinguish sleet from snow", () => {
  assert.equal(precipitationCategory(weather({ precipitationType: "snow", precipitationCode: 2 })), "rain-or-sleet");
  assert.equal(precipitationCategory(weather({ precipitationType: "snow", precipitationCode: 3 })), "snow");
  const date = new Date(2026, 10, 10, 12);
  assert.equal(
    selectScheduledLookbook(manifest, weather({ precipitationType: "snow", precipitationCode: 2 }), date).condition.id,
    "04-sleet",
  );
  assert.equal(
    selectScheduledLookbook(manifest, weather({ precipitationType: "snow", precipitationCode: 3 }), date).condition.id,
    "05-snow",
  );
});

test("dates outside completed Excel periods use the fallback", () => {
  assert.equal(selectScheduledLookbook(manifest, weather(), new Date(2026, 6, 28, 12)), null);
  assert.equal(selectScheduledLookbook(manifest, weather(), new Date(2027, 1, 15, 12)), null);
});

test("shuffle cycle shows every video once before reshuffling", () => {
  const storage = new TestStorage();
  let seed = 17;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const videos = ["a.mp4", "b.mp4", "c.mp4"];
  const played = Array.from(
    { length: 6 },
    () => takeNextVideo("test-pool", videos, { storage, random }),
  );
  assert.deepEqual(new Set(played.slice(0, 3)), new Set(videos));
  assert.deepEqual(new Set(played.slice(3, 6)), new Set(videos));
  assert.notEqual(played[2], played[3]);
});
test("every one of the 45 Excel conditions is reachable", () => {
  const dateByPeriod = {
    "08-14_08-27": new Date(2026, 7, 20, 12),
    "08-28_09-13": new Date(2026, 8, 1, 12),
    "09-14_10-04": new Date(2026, 8, 20, 12),
    "10-05_10-18": new Date(2026, 9, 10, 12),
    "10-19_11-01": new Date(2026, 9, 25, 12),
    "11-02_11-29": new Date(2026, 10, 10, 12),
    "11-30_01-03": new Date(2026, 11, 15, 12),
    "01-04_01-31": new Date(2027, 0, 15, 12),
    "02-01_02-14": new Date(2027, 1, 7, 12),
  };

  for (const period of manifest.periods) {
    for (const condition of period.conditions) {
      const match = condition.match;
      let sample;
      if (match.kind === "temperature") {
        const temperature = match.min !== undefined && match.max !== undefined
          ? (match.min + match.max) / 2
          : match.min ?? match.max - 0.1;
        sample = weather({ temperature });
      } else if (match.kind === "precipitationAmount") {
        const precipitationAmount = match.min ?? match.max - 0.1;
        sample = weather({ precipitationType: "rain", precipitationCode: 1, precipitationAmount });
      } else {
        const precipitationCode = match.category === "snow" ? 3 : 2;
        sample = weather({ precipitationType: "snow", precipitationCode });
      }
      const selected = selectScheduledLookbook(manifest, sample, dateByPeriod[period.id]);
      assert.equal(selected.condition.id, condition.id, `${period.id}/${condition.id}`);
    }
  }
});