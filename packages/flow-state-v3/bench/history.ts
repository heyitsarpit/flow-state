import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { Schema } from "effect";
import { CONCERNS, type Concern } from "./declare.ts";

/**
 * Where each concern's history lives: `history/<concern>.csv`, and each record's raw samples under
 * `history/samples/`.
 */
export const HISTORY = join(import.meta.dirname, "history");

/**
 * How far a row's numbers can be trusted beside rows of another commit: measured in this run beside
 * its comparison, recorded alone on this tree, or backfilled from a past commit's worktree.
 */
export const Confidence = Schema.Literals(["recorded", "backfill"]);

/**
 * One history row: one bench's result at one commit, on one runtime and machine.
 *
 * **Details**
 *
 * Times are per unit in ms, bytes per unit for a bytes bench. `median` is the median of the
 * workers' medians, `spread` the scaled MAD of those medians as a share of `median`, the spread
 * between processes; `mad` the scaled MAD of every sample pooled. `p99` is empty below 1,000
 * samples. `tier` is the tier that measured it, and rows of different tiers are never compared.
 * `shape` hashes the fixture's shape; `counters` is `name=value` pairs joined by `;`.
 * `samples` names the gzip file of the raw samples. `budget` and `budget_state` are empty when the
 * bench has no budget.
 */
export const Row = Schema.Struct({
  commit: Schema.String,
  tree: Schema.Literals(["clean", "dirty"]),
  date: Schema.String,
  runtime: Schema.String,
  version: Schema.String,
  flags: Schema.String,
  machine: Schema.String,
  cpu: Schema.String,
  cores: Schema.FiniteFromString,
  power: Schema.String,
  load: Schema.FiniteFromString,
  confidence: Confidence,
  tier: Schema.Literals(["quick", "full", "dev"]),
  concern: Schema.Literals(CONCERNS),
  bench: Schema.String,
  size: Schema.FiniteFromString,
  unit: Schema.String,
  workers: Schema.FiniteFromString,
  samples_n: Schema.FiniteFromString,
  warmup: Schema.FiniteFromString,
  batch: Schema.FiniteFromString,
  median: Schema.NumberFromString,
  min: Schema.NumberFromString,
  max: Schema.NumberFromString,
  p99: Schema.NumberFromString,
  mad: Schema.NumberFromString,
  spread: Schema.NumberFromString,
  shape: Schema.String,
  counters: Schema.String,
  samples: Schema.String,
  budget: Schema.String,
  budget_state: Schema.String,
});

/**
 * One decoded history row.
 */
export type Row = typeof Row.Type;

const COLUMNS = Object.keys(Row.fields);

const quoted = (cell: string) => (/[",\n]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell);

// One CSV cell from where the last one ended: quoted, with doubled quotes inside, or plain up to
// the next comma; then a comma or the line's end.
const CELL = String.raw`(?:"((?:[^"]|"")*)"|([^,"]*))(,|$)`;

// Splits one CSV line into cells.
const cellsOf = (line: string) => {
  const cells: Array<string> = [];
  const cell = new RegExp(CELL, "y");

  for (let m = cell.exec(line); m !== null; m = m[3] === "" ? null : cell.exec(line))
    cells.push(m[1]?.replaceAll('""', '"') ?? m[2] ?? "");

  return cells;
};

const encodeRow = Schema.encodeSync(Row);
const decodeRow = Schema.decodeUnknownSync(Row);

/**
 * Appends rows to their concern's CSV, writing the header first into a new file. Every row is
 * encoded through `Row`, so a row that breaks the shape is refused before anything is written.
 */
export const appendRows = (root: string, rows: ReadonlyArray<Row>) => {
  const lines = rows.map((row) => {
    const encoded: Readonly<Record<string, string>> = encodeRow(row);

    return { concern: row.concern, line: COLUMNS.map((c) => quoted(encoded[c] ?? "")).join(",") };
  });

  for (const concern of CONCERNS) {
    const mine = lines.filter((l) => l.concern === concern);

    if (mine.length === 0) continue;
    const file = join(root, `${concern}.csv`);
    mkdirSync(root, { recursive: true });

    if (!existsSync(file)) writeFileSync(file, `${COLUMNS.join(",")}\n`);
    const header = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";

    if (header !== COLUMNS.join(","))
      throw new Error(`${file} has other columns than a row has now; move it aside first`);

    appendFileSync(file, mine.map((l) => `${l.line}\n`).join(""));
  }
};

/**
 * Every row of a concern's CSV, each decoded through `Row`; a file that is not there reads empty.
 */
export const readRows = (concern: Concern, root: string) => {
  const file = join(root, `${concern}.csv`);

  if (!existsSync(file)) return [];

  const [header = "", ...lines] = readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l !== "");

  const names = cellsOf(header);

  return lines.map((line) => {
    const cells = cellsOf(line);

    return decodeRow(Object.fromEntries(names.map((name, n) => [name, cells[n] ?? ""])));
  });
};

/**
 * One record's raw samples: per bench, each worker's samples in order.
 */
export const Samples = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Array(Schema.Array(Schema.Number))),
);

/**
 * Writes one record's raw samples, gzipped, and returns the path its rows name, relative to the
 * history folder.
 */
export const writeSamples = (
  root: string,
  concern: Concern,
  name: string,
  samples: Readonly<Record<string, ReadonlyArray<ReadonlyArray<number>>>>,
) => {
  const path = join("samples", concern, `${name}.json.gz`);
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, gzipSync(Schema.encodeSync(Samples)(samples)));

  return path;
};

/**
 * Reads the raw samples a row names; they stay on the machine that took them, so a file that is
 * not here reads empty, and a comparison falls back to the row's median.
 */
export const readSamples = (path: string, root: string) =>
  path !== "" && existsSync(join(root, path))
    ? Schema.decodeUnknownSync(Samples)(gunzipSync(readFileSync(join(root, path))).toString("utf8"))
    : {};
