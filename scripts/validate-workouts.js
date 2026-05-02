const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "workouts.ts");
const source = fs.readFileSync(sourcePath, "utf8");

const runnable = `${source.replace(/^export\s+/gm, "")}
globalThis.__workoutExports = {
  RAW,
  WORKOUTS,
  BY_ID,
  BY_CATEGORY,
  CATEGORY_LABELS,
  SCHEDULE,
  collectKeys,
  previewLine,
};`;

const context = {
  console,
  Date,
  Math,
  Object,
  URL,
};

vm.createContext(context);
vm.runInContext(runnable, context, { filename: sourcePath });

const {
  RAW,
  WORKOUTS,
  BY_ID,
  BY_CATEGORY,
  CATEGORY_LABELS,
  SCHEDULE,
  collectKeys,
  previewLine,
} = context.__workoutExports;

const errors = [];
const warnings = [];
const validTypes = new Set([
  "strength_split",
  "strength_total_body",
  "cardio_12",
  "cardio_4group",
]);

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function requireArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
}

function checkUrl(url, label) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      fail(`${label} has invalid protocol: ${url}`);
    }
  } catch {
    fail(`${label} is not a valid URL: ${url}`);
  }
}

function walkVideos(value, label) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkVideos(item, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.v === "string") checkUrl(value.v, `${label}.v`);
  if (typeof value.video === "string") checkUrl(value.video, `${label}.video`);
  Object.entries(value).forEach(([key, child]) => walkVideos(child, `${label}.${key}`));
}

if (!Array.isArray(RAW)) fail("RAW must be an array");
if (!Array.isArray(WORKOUTS)) fail("WORKOUTS must be an array");

const rawIds = new Map();
for (const [index, raw] of RAW.entries()) {
  if (!raw || typeof raw !== "object") {
    fail(`RAW[${index}] must be an object`);
    continue;
  }
  if (!raw.i || typeof raw.i !== "string") fail(`RAW[${index}] missing string id`);
  if (typeof raw.n !== "number") fail(`${raw.i || `RAW[${index}]`} missing numeric n`);
  if (!raw.c || typeof raw.c !== "string") fail(`${raw.i || `RAW[${index}]`} missing category`);
  if (!validTypes.has(raw.t)) fail(`${raw.i || `RAW[${index}]`} has invalid type ${raw.t}`);
  if (raw.i) rawIds.set(raw.i, (rawIds.get(raw.i) || 0) + 1);
  walkVideos(raw, raw.i || `RAW[${index}]`);
}

for (const [id, count] of rawIds) {
  if (count > 1) fail(`duplicate RAW id: ${id} (${count} entries)`);
}

const workoutIds = new Set();
for (const workout of WORKOUTS) {
  if (!workout.id) {
    fail("expanded workout missing id");
    continue;
  }
  if (workoutIds.has(workout.id)) fail(`duplicate expanded workout id: ${workout.id}`);
  workoutIds.add(workout.id);

  if (!CATEGORY_LABELS[workout.category]) {
    fail(`${workout.id} has unlabeled category: ${workout.category}`);
  }
  if (!validTypes.has(workout.type)) fail(`${workout.id} has invalid type: ${workout.type}`);

  if (workout.type === "strength_split") requireArray(workout.groups, `${workout.id}.groups`);
  if (workout.type === "strength_total_body") {
    requireArray(workout.pattern1, `${workout.id}.pattern1`);
    requireArray(workout.pattern2, `${workout.id}.pattern2`);
    requireArray(workout.pattern3, `${workout.id}.pattern3`);
  }
  if (workout.type === "cardio_12") requireArray(workout.exercises, `${workout.id}.exercises`);
  if (workout.type === "cardio_4group") {
    for (const group of ["A", "B", "C", "D"]) {
      requireArray(workout.groups && workout.groups[group], `${workout.id}.groups.${group}`);
    }
  }

  const keys = collectKeys(workout);
  if (!Array.isArray(keys) || keys.length === 0) warn(`${workout.id} has no checklist items`);
  try {
    previewLine(workout);
  } catch (error) {
    fail(`${workout.id} previewLine failed: ${error.message}`);
  }
}

if (Object.keys(BY_ID).length !== WORKOUTS.length) {
  fail(`BY_ID has ${Object.keys(BY_ID).length} entries for ${WORKOUTS.length} workouts`);
}

for (const [category, workouts] of Object.entries(BY_CATEGORY)) {
  if (!CATEGORY_LABELS[category]) fail(`BY_CATEGORY has unlabeled category: ${category}`);
  if (!Array.isArray(workouts) || workouts.length === 0) {
    fail(`BY_CATEGORY.${category} must be a non-empty array`);
  }
}

for (const [weekName, week] of Object.entries(SCHEDULE)) {
  if (!Array.isArray(week) || week.length !== 7) {
    fail(`SCHEDULE.${weekName} must have 7 days`);
    continue;
  }
  week.forEach((slot, dayIndex) => {
    if (!slot.title) fail(`SCHEDULE.${weekName}[${dayIndex}] missing title`);
    if (!Array.isArray(slot.categories)) fail(`SCHEDULE.${weekName}[${dayIndex}] missing categories`);
    for (const category of slot.categories || []) {
      if (!BY_CATEGORY[category]) {
        fail(`SCHEDULE.${weekName}[${dayIndex}] references empty/missing category: ${category}`);
      }
    }
  });
}

for (const message of warnings) console.warn(`[warn] ${message}`);

if (errors.length > 0) {
  console.error(`Workout validation failed with ${errors.length} error(s):`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Workout validation passed: ${WORKOUTS.length} workouts, ${Object.keys(BY_CATEGORY).length} categories.`);
