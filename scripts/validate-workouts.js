const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "workouts.ts");
const exerciseSourcePath = path.join(root, "src", "exerciseLibrary.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const exerciseSource = fs.readFileSync(exerciseSourcePath, "utf8");

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
const EXERCISES = extractExerciseLibrary(exerciseSource);

const errors = [];
const warnings = [];
const validTypes = new Set([
  "strength_split",
  "strength_total_body",
  "cardio_12",
  "cardio_4group",
]);
const exerciseIds = new Set();
const exerciseCategories = new Map();

for (const [index, exercise] of EXERCISES.entries()) {
  if (!exercise.id) fail(`EXERCISES[${index}] missing id`);
  if (!exercise.name) fail(`${exercise.id || `EXERCISES[${index}]`} missing name`);
  if (!exercise.categoryKey) fail(`${exercise.id || `EXERCISES[${index}]`} missing categoryKey`);
  if (!exercise.categoryLabel) fail(`${exercise.id || `EXERCISES[${index}]`} missing categoryLabel`);
  if (!exercise.mode) fail(`${exercise.id || `EXERCISES[${index}]`} missing mode`);
  if (exercise.id) {
    if (exerciseIds.has(exercise.id)) fail(`duplicate exercise id: ${exercise.id}`);
    exerciseIds.add(exercise.id);
  }
  if (exercise.video) checkUrl(exercise.video, `${exercise.id}.video`);
  if (exercise.categoryKey) {
    exerciseCategories.set(
      exercise.categoryKey,
      (exerciseCategories.get(exercise.categoryKey) || 0) + 1,
    );
  }
}

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

function extractExerciseLibrary(sourceText) {
  const marker = "export const EXERCISES: Exercise[] = ";
  const start = sourceText.indexOf(marker);
  if (start < 0) throw new Error("Could not find EXERCISES export");
  const arrayStart = sourceText.indexOf("= [", start) + 2;
  const endMarker = ";\n\nexport const EXERCISES_BY_ID";
  const arrayEnd = sourceText.indexOf(endMarker, arrayStart);
  if (arrayStart < 0 || arrayEnd < 0) throw new Error("Could not isolate EXERCISES array");
  return JSON.parse(sourceText.slice(arrayStart, arrayEnd));
}

function normalizeExerciseName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/dumbells/g, "dumbbells")
    .replace(/alt\./g, "alternating")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferCategory(categoryHint, exerciseName = "") {
  const text = `${normalizeExerciseName(categoryHint)} ${normalizeExerciseName(exerciseName)}`;
  if (text.includes("abs") || text.includes("crunch") || text.includes("flutter") || text.includes("jack knife")) return text.includes("ball") ? "abs_medicine_ball" : "abs_face_up";
  if (text.includes("pushup") || text.includes("push up")) return "upper_push_horizontal_compound";
  if (text.includes("pullup") || text.includes("pull up")) return "upper_pull_vertical_compound";
  if (text.includes("reverse fly") || text.includes("reverse flies")) return "back_isolation_single_joint";
  if (text.includes("flat chest press") || text.includes("chest press")) return "upper_push_horizontal_compound";
  if (text.includes("incline chest press") || text.includes("shoulder press")) return "upper_push_vertical_compound";
  if (text.includes("renegade row") || text.includes(" row")) return "upper_pull_horizontal_compound";
  if (text.includes("pull over") || text.includes("pullover")) return "upper_pull_vertical_compound";
  if (text.includes("good morning") || text.includes("deadlift")) return "legs_group_2_compound";
  if (text.includes("jump rope") || text.includes("slider")) return "misc_specialty_equipment";
  if (text.includes("chest") && (text.includes("isolate") || text.includes("fly"))) return "chest_isolation_single_joint";
  if (text.includes("back") && (text.includes("isolate") || text.includes("reverse fly"))) return "back_isolation_single_joint";
  if (text.includes("tricep")) return "triceps";
  if (text.includes("bicep")) return "biceps";
  if (text.includes("leg") || text.includes("squat") || text.includes("lunge") || text.includes("hamstring")) {
    if (text.includes("isolate") || text.includes("extension") || text.includes("curl")) return "legs_group_3_isolate_single_joint";
    if (text.includes("deadlift") || text.includes("hinge") || text.includes("hamstring")) return "legs_group_2_compound";
    return "legs_group_1_compound";
  }
  if ((text.includes("upper") || text.includes("chest")) && text.includes("push") && text.includes("horizontal")) return "upper_push_horizontal_compound";
  if ((text.includes("upper") || text.includes("chest") || text.includes("shoulder")) && text.includes("push") && text.includes("vertical")) return "upper_push_vertical_compound";
  if ((text.includes("upper") || text.includes("back") || text.includes("row")) && text.includes("pull") && text.includes("horizontal")) return "upper_pull_horizontal_compound";
  if ((text.includes("upper") || text.includes("back") || text.includes("lat") || text.includes("pull up")) && text.includes("pull") && text.includes("vertical")) return "upper_pull_vertical_compound";
  if (text.includes("standing stationary")) return "standing_stationary";
  if (text.includes("standing plyometric")) return "standing_plyometric";
  if (text.includes("high plank upper")) return "high_plank_upper_body";
  if (text.includes("high plank lower")) return "high_plank_lower_body";
  if (text.includes("low plank upper")) return "low_plank_upper_body";
  if (text.includes("low plank lower")) return "low_plank_lower_body";
  if (text.includes("medicine ball stationary")) return "medicine_ball_stationary";
  if (text.includes("medicine ball plyometric")) return "medicine_ball_plyometric";
  if (text.includes("kettlebell misc")) return "kettlebell_misc_combos";
  if (text.includes("kettlebell")) return "kettlebell";
  if (text.includes("bodyweight misc")) return "bodyweight_misc_combos";
  if (text.includes("monster band")) return "monster_band";
  if (text.includes("farmer")) return "farmers_walk";
  if (text.includes("agility") || text.includes("ladder")) return "agility_ladder";
  if (text.includes("battle rope")) return "battle_ropes";
  if (text.includes("cardio machine") || text.includes("bike") || text.includes("rower") || text.includes("ski erg")) return "cardio_machines";
  if (text.includes("box jump") || text.includes("trx") || text.includes("tire") || text.includes("sledge")) return "misc_specialty_equipment";
  return null;
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

  const slotChecks = [];
  if (workout.type === "strength_split") {
    workout.groups.forEach((row, i) =>
      slotChecks.push({ key: `g${i}`, exercise: row.exercise, hint: row.movement }),
    );
  } else if (workout.type === "strength_total_body") {
    workout.pattern1.forEach((row, i) =>
      slotChecks.push({ key: `p1_${i}`, exercise: row.exercise, hint: row.movement }),
    );
    workout.pattern2.forEach((row, i) =>
      slotChecks.push({ key: `p2_${i}`, exercise: row.exercise, hint: row.movement }),
    );
    workout.pattern3.forEach((row, i) =>
      slotChecks.push({ key: `p3_${i}`, exercise: row.exercise, hint: row.movement }),
    );
  } else if (workout.type === "cardio_12") {
    workout.exercises.forEach((row, i) =>
      slotChecks.push({ key: `x_${i}`, exercise: row.exercise, hint: row.movement }),
    );
  } else if (workout.type === "cardio_4group") {
    for (const group of ["A", "B", "C", "D"]) {
      workout.groups[group].forEach((row, i) =>
        slotChecks.push({ key: `G${group}_${i}`, exercise: row.exercise, hint: row.equipment }),
      );
    }
  }
  workout.abs.forEach((row, i) =>
    slotChecks.push({ key: `A_${i}`, exercise: row.exercise, hint: "Abs" }),
  );

  for (const slot of slotChecks) {
    if (/^(exercise|bonus sets)/i.test(String(slot.exercise || ""))) continue;
    const category = inferCategory(slot.hint, slot.exercise);
    if (category && !exerciseCategories.has(category)) {
      fail(`${workout.id}.${slot.key} inferred missing exercise category: ${category}`);
    } else if (!category) {
      warn(`${workout.id}.${slot.key} has no swap category match: ${slot.exercise}`);
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
