const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const defaultWorkbook = "C:\\Users\\Aaron\\Downloads\\A-1_ Exercises- Master List.xlsx";
const workbookPath = process.argv[2] || defaultWorkbook;
const outPath = path.resolve(__dirname, "..", "src", "exerciseLibrary.ts");

function readZipEntries(filePath) {
  const data = fs.readFileSync(filePath);
  const entries = new Map();
  let offset = data.length - 22;
  while (offset >= 0 && data.readUInt32LE(offset) !== 0x06054b50) offset--;
  if (offset < 0) throw new Error("Could not find ZIP end-of-central-directory record");

  const entryCount = data.readUInt16LE(offset + 10);
  let centralOffset = data.readUInt32LE(offset + 16);

  for (let i = 0; i < entryCount; i++) {
    if (data.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error(`Invalid central directory entry at ${centralOffset}`);
    }
    const method = data.readUInt16LE(centralOffset + 10);
    const compressedSize = data.readUInt32LE(centralOffset + 20);
    const fileNameLength = data.readUInt16LE(centralOffset + 28);
    const extraLength = data.readUInt16LE(centralOffset + 30);
    const commentLength = data.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = data.readUInt32LE(centralOffset + 42);
    const name = data.toString("utf8", centralOffset + 46, centralOffset + 46 + fileNameLength);

    if (data.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid local header for ${name}`);
    }
    const localNameLength = data.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = data.readUInt16LE(localHeaderOffset + 28);
    const payloadOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const payload = data.subarray(payloadOffset, payloadOffset + compressedSize);

    let content;
    if (method === 0) content = payload;
    else if (method === 8) content = zlib.inflateRawSync(payload);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);

    entries.set(name, content.toString("utf8"));
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`));
  return match ? xmlText(match[1]) : "";
}

function colIndex(cellRef) {
  const letters = (cellRef.match(/^[A-Z]+/) || [""])[0];
  let value = 0;
  for (const ch of letters) value = value * 26 + ch.charCodeAt(0) - 64;
  return value - 1;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(value) {
  return value
    .toLowerCase()
    .replace(/dumbells/g, "dumbbells")
    .replace(/alt\./g, "alternating")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMode(value) {
  const v = normalizeName(value || "");
  if (!v) return "Freeweights";
  if (v.includes("cable")) return "Cables";
  if (v.includes("machine") || v.includes("bike") || v.includes("rower") || v.includes("ski")) return "Machines";
  if (v.includes("bodyweight") || v.includes("push up") || v.includes("dip")) return "Bodyweight";
  return "Freeweights";
}

const STRENGTH_MODE_MARKERS = new Map([
  ["machines", "Machines"],
  ["free weights", "Free Weights"],
  ["body weight", "Bodyweight"],
  ["bodyweight", "Bodyweight"],
  ["barbell", "Barbell"],
  ["dumbbells", "Dumbbells"],
  ["dumbells", "Dumbbells"],
]);

function strengthModeMarker(value) {
  return STRENGTH_MODE_MARKERS.get(normalizeName(value));
}

function cleanUrl(value) {
  return value ? value.replace(/'+$/g, "") : value;
}

function readSharedStrings(entries) {
  const xml = entries.get("xl/sharedStrings.xml") || "";
  const strings = [];
  for (const si of xml.matchAll(/<si\b[\s\S]*?<\/si>/g)) {
    const text = [...si[0].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((m) => xmlText(m[1]))
      .join("");
    strings.push(text);
  }
  return strings;
}

function readRelationships(entries, relPath) {
  const xml = entries.get(relPath) || "";
  const relationships = new Map();
  for (const rel of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    relationships.set(attr(rel[0], "Id"), attr(rel[0], "Target"));
  }
  return relationships;
}

function readWorkbookSheets(entries) {
  const workbook = entries.get("xl/workbook.xml") || "";
  const rels = readRelationships(entries, "xl/_rels/workbook.xml.rels");
  const sheets = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const rid = attr(sheet[0], "r:id");
    sheets.push({
      name: attr(sheet[0], "name"),
      path: `xl/${rels.get(rid)}`,
    });
  }
  return sheets;
}

function readSheet(entries, sheetPath, sharedStrings) {
  const xml = entries.get(sheetPath) || "";
  const rows = [];
  const cells = new Map();

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = new Map();
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellTag = `<c ${cellMatch[1]}>`;
      const ref = attr(cellTag, "r");
      const type = attr(cellTag, "t");
      const body = cellMatch[2] || "";
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = "";
      if (type === "s" && v !== undefined) value = sharedStrings[Number(v)] || "";
      else if (type === "inlineStr") {
        value = [...body.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)]
          .map((m) => xmlText(m[1]))
          .join("");
      } else if (v !== undefined) value = xmlText(v);
      row.set(colIndex(ref), value.trim());
      cells.set(ref, { value: value.trim() });
    }
    if (row.size) rows.push(row);
  }

  const relPath = sheetPath.replace("xl/worksheets/", "xl/worksheets/_rels/") + ".rels";
  const rels = readRelationships(entries, relPath);
  for (const link of xml.matchAll(/<hyperlink\b[^>]*>/g)) {
    const ref = attr(link[0], "ref");
    const rid = attr(link[0], "r:id");
    const target = rels.get(rid);
    if (target && cells.has(ref)) cells.get(ref).hyperlink = target;
  }

  return { rows, cells };
}

function cellRef(col, rowIndexZeroBased) {
  let n = col + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return `${out}${rowIndexZeroBased + 1}`;
}

function addExercise(list, seen, exercise) {
  if (
    !exercise.name ||
    /^\d+$/.test(exercise.name) ||
    /^there are no exercises/i.test(exercise.name) ||
    /^movement\.$/i.test(exercise.name)
  ) return;
  const modeRaw = exercise.modeRaw || exercise.mode || "General";
  const modeGroup = normalizeMode(exercise.modeGroup || exercise.mode || modeRaw);
  const idBase = slug(`${exercise.kind}_${exercise.categoryKey}_${modeGroup}_${exercise.name}`) || `exercise_${list.length + 1}`;
  const idCounts = list.idCounts || (list.idCounts = new Map());
  const count = idCounts.get(idBase) || 0;
  idCounts.set(idBase, count + 1);
  const id = count === 0 ? idBase : `${idBase}_${count + 1}`;
  const row = {
    id,
    aliases: [],
    ...exercise,
    mode: modeGroup,
    modeRaw,
    modeGroup,
    video: cleanUrl(exercise.video),
    normalizedName: normalizeName(exercise.name),
  };
  list.push(row);
}

function parseWorkbook(filePath) {
  const entries = readZipEntries(filePath);
  const shared = readSharedStrings(entries);
  const sheets = readWorkbookSheets(entries);
  const list = [];
  const seen = new Map();

  for (const sheetInfo of sheets) {
    const sheet = readSheet(entries, sheetInfo.path, shared);
    if (sheetInfo.name === "Strength Exercises- Master List") {
      const headers = [...sheet.rows[0].entries()]
        .filter(([, value]) => value && !/^\d+$/.test(value))
        .map(([col, value]) => ({ col, label: value }));
      for (const header of headers) {
        let modeRaw = "General";
        for (let row = 1; row < sheet.rows.length; row++) {
          const name = sheet.rows[row].get(header.col);
          if (!name) continue;
          const marker = strengthModeMarker(name);
          if (marker) {
            modeRaw = marker;
            continue;
          }
          const modeGroup = normalizeMode(name);
          addExercise(list, seen, {
            name,
            kind: "strength",
            categoryKey: slug(header.label.replace(/- Steve$/i, "")),
            categoryLabel: header.label.replace(/- Steve$/i, ""),
            mode: modeGroup,
            modeRaw,
            modeGroup,
            video: (sheet.cells.get(cellRef(header.col, row)) || {}).hyperlink,
            sourceSheet: sheetInfo.name,
          });
        }
      }
    } else if (sheetInfo.name === "Cardio Exercises- Master List") {
      const headers = [...sheet.rows[0].entries()]
        .filter(([, value]) => value && !/^\d+$/.test(value))
        .map(([col, value]) => ({ col, label: value }));
      for (const header of headers) {
        for (let row = 1; row < sheet.rows.length; row++) {
          const name = sheet.rows[row].get(header.col);
          if (!name) continue;
          addExercise(list, seen, {
            name,
            kind: "cardio",
            categoryKey: slug(header.label),
            categoryLabel: header.label,
            mode: normalizeMode(header.label),
            modeRaw: header.label,
            modeGroup: normalizeMode(header.label),
            video: (sheet.cells.get(cellRef(header.col, row)) || {}).hyperlink,
            sourceSheet: sheetInfo.name,
          });
        }
      }
    } else if (sheetInfo.name === "Warm Ups Stretches") {
      const sections = [
        { col: 0, videoCol: 3, start: 2, kind: "warmup", label: "Warm Up Circuits" },
        { col: 6, videoCol: 9, start: 2, kind: "warmup", label: "Warm Up Exercises" },
        { col: 12, videoCol: 15, start: 2, kind: "stretch", label: "Stretch Exercises" },
      ];
      for (const section of sections) {
        for (let row = section.start; row < sheet.rows.length; row++) {
          const name = sheet.rows[row].get(section.col);
          if (!name) continue;
          addExercise(list, seen, {
            name,
            kind: section.kind,
            categoryKey: slug(section.label),
            categoryLabel: section.label,
            mode: "General",
            modeRaw: "General",
            modeGroup: "General",
            video: (sheet.cells.get(cellRef(section.videoCol, row)) || {}).hyperlink,
            sourceSheet: sheetInfo.name,
          });
        }
      }
    } else if (sheetInfo.name === "Abs- Master List") {
      const sections = [
        { col: 0, start: 1, label: "Abs- face Up" },
        { col: 3, start: 1, label: "Abs- Medicine Ball" },
      ];
      for (const section of sections) {
        for (let row = section.start; row < sheet.rows.length; row++) {
          const name = sheet.rows[row].get(section.col);
          if (!name) continue;
          addExercise(list, seen, {
            name,
            kind: "abs",
            categoryKey: slug(section.label),
            categoryLabel: section.label,
            mode: section.label.toLowerCase().includes("medicine") ? "Medicine Ball" : "Bodyweight",
            modeRaw: section.label,
            modeGroup: section.label.toLowerCase().includes("medicine") ? "Medicine Ball" : "Bodyweight",
            video: (sheet.cells.get(cellRef(section.col, row)) || {}).hyperlink,
            sourceSheet: sheetInfo.name,
          });
        }
      }
    }
  }

  delete list.idCounts;
  return list.sort((a, b) =>
    `${a.kind}|${a.categoryLabel}|${a.modeGroup}|${a.name}`.localeCompare(
      `${b.kind}|${b.categoryLabel}|${b.modeGroup}|${b.name}`,
    ),
  );
}

function emitLibrary(exercises, sourceFile) {
  return `// Generated by scripts/import-exercise-library.js from ${sourceFile.replace(/\\/g, "/")}
// Do not edit by hand. Re-run the import script when the workbook changes.

export type ExerciseKind = "strength" | "cardio" | "abs" | "warmup" | "stretch";

export type Exercise = {
  id: string;
  name: string;
  normalizedName: string;
  kind: ExerciseKind;
  categoryKey: string;
  categoryLabel: string;
  mode: string;
  modeRaw: string;
  modeGroup: string;
  video?: string;
  sourceSheet: string;
  aliases: string[];
};

export const EXERCISES: Exercise[] = ${JSON.stringify(exercises, null, 2)};

export const EXERCISES_BY_ID: Record<string, Exercise> = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export const EXERCISES_BY_CATEGORY: Record<string, Exercise[]> = EXERCISES.reduce(
  (acc, exercise) => {
    (acc[exercise.categoryKey] = acc[exercise.categoryKey] || []).push(exercise);
    return acc;
  },
  {} as Record<string, Exercise[]>,
);

export function normalizeExerciseName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/dumbells/g, "dumbbells")
    .replace(/alt\\./g, "alternating")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

export function normalizeMode(value: string | null | undefined) {
  const raw = String(value || "");
  const v = normalizeExerciseName(raw);
  if (!v) return "Freeweights";
  if (v.includes("cable")) return "Cables";
  if (v.includes("machine") || v.includes("bike") || v.includes("rower") || v.includes("ski")) return "Machines";
  if (v.includes("bodyweight") || v.includes("push up") || v.includes("dip")) return "Bodyweight";
  return "Freeweights";
}

export function inferExerciseCategoryKey(
  categoryHint: string | null | undefined,
  exerciseName = "",
): string | null {
  const hint = normalizeExerciseName(categoryHint);
  const name = normalizeExerciseName(exerciseName);
  const text = \`\${hint} \${name}\`;

  if (text.includes("abs") || text.includes("crunch") || text.includes("flutter") || text.includes("jack knife")) {
    if (text.includes("medicine ball") || text.includes("ball")) return "abs_medicine_ball";
    return "abs_face_up";
  }
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

export function findExerciseMatch(
  exerciseName: string,
  categoryHint?: string | null,
  modeHint?: string | null,
): Exercise | null {
  const normalizedName = normalizeExerciseName(exerciseName);
  const categoryKey = inferExerciseCategoryKey(categoryHint, exerciseName);
  const mode = normalizeMode(modeHint);
  const pool = categoryKey ? EXERCISES_BY_CATEGORY[categoryKey] || [] : EXERCISES;

  return (
    pool.find((exercise) => exercise.normalizedName === normalizedName && normalizeMode(exercise.modeGroup) === mode) ||
    pool.find((exercise) => exercise.normalizedName === normalizedName) ||
    EXERCISES.find((exercise) => exercise.normalizedName === normalizedName) ||
    null
  );
}

export function getSwapModes(categoryKey: string | null | undefined): string[] {
  if (!categoryKey) return [];
  const modes = new Set((EXERCISES_BY_CATEGORY[categoryKey] || []).map((exercise) => normalizeMode(exercise.modeGroup)));
  return Array.from(modes).sort();
}

export function getSwapCandidates(
  categoryKey: string | null | undefined,
  mode?: string | null,
  excludeExerciseId?: string | null,
): Exercise[] {
  if (!categoryKey) return [];
  const targetMode = mode ? normalizeMode(mode) : null;
  return (EXERCISES_BY_CATEGORY[categoryKey] || [])
    .filter((exercise) => !targetMode || normalizeMode(exercise.modeGroup) === targetMode)
    .filter((exercise) => !excludeExerciseId || exercise.id !== excludeExerciseId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
`;
}

if (!fs.existsSync(workbookPath)) {
  console.error(`Workbook not found: ${workbookPath}`);
  process.exit(1);
}

const exercises = parseWorkbook(workbookPath);
fs.writeFileSync(outPath, emitLibrary(exercises, path.basename(workbookPath)), "utf8");
console.log(`Imported ${exercises.length} exercises to ${path.relative(process.cwd(), outPath)}`);
