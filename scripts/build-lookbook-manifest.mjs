import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FALLBACK_LOOKBOOK_VIDEO, LOOKBOOK_SCHEDULE } from "../src/lookbook-schedule.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const videosRoot = path.join(repositoryRoot, "assets", "lookbook-videos");
const outputPath = path.join(videosRoot, "manifest.json");
const supportedExtensions = new Set([".mp4", ".webm"]);

function publicVideoPath(...segments) {
  return `./assets/lookbook-videos/${segments.map(encodeURIComponent).join("/")}`;
}

async function listVideos(periodFolder, conditionFolder) {
  const directory = path.join(videosRoot, periodFolder, conditionFolder);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, ".gitkeep"), "", { flag: "a" });
  const entries = await readdir(directory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "ko", { numeric: true, sensitivity: "base" }))
    .map((fileName) => publicVideoPath(periodFolder, conditionFolder, fileName));
}

const periods = [];
let registeredCount = 0;
let incompleteCount = 0;

for (const period of LOOKBOOK_SCHEDULE) {
  const conditions = [];
  for (const condition of period.conditions) {
    const videos = await listVideos(period.folder, condition.folder);
    registeredCount += videos.length;
    if (videos.length !== condition.expectedCount) {
      incompleteCount += 1;
      if (videos.length > 0) {
        console.warn(
          `Lookbook count mismatch: ${period.folder}/${condition.folder} ` +
            `has ${videos.length}, expected ${condition.expectedCount}.`,
        );
      }
    }
    conditions.push({ ...condition, videos });
  }
  periods.push({ ...period, conditions });
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  fallbackVideo: FALLBACK_LOOKBOOK_VIDEO,
  periods,
};

await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(
  `Built lookbook manifest: ${registeredCount} video(s), ` +
    `${incompleteCount} of ${LOOKBOOK_SCHEDULE.length * 5} folders awaiting their expected count.`,
);