import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { analyzeFile, formatTable, writesFile } from "./agent-metrics.ts";

const FIXTURE = join(import.meta.dir, "fixtures", "agent-fixture01.jsonl");

describe("analyzeFile on the hand-made fixture", () => {
  test("every column holds its known value", async () => {
    const row = await analyzeFile(FIXTURE);
    expect(row.agent).toBe("fixture01");
    expect(row.model).toBe("opus");
    expect(row.effort).toBe("medium");
    expect(row.start).toBe("2026-11-14T10:00:00.000Z");
    expect(row.end).toBe("2026-11-14T10:09:40.000Z");
    expect(row.wall_min).toBe(9.67);
    expect(row.turns).toBe(6);
    expect(row.calls).toBe(5); // the decoy api-request-blob line is not counted
    expect(row.calls_per_turn).toBe(0.83);
    expect(row.model_min).toBe(1.47); // 88 s: lead-ins of 30, 7, 30, 7, 9 s plus 1 s, 2 s, 1 s, 1 s spans
    expect(row.think_min).toBe(0.75); // 20 s + 5 s + 20 s
    expect(row.verify_min).toBe(3); // bun test, 10:06:31 to 10:09:31; the sed call is not a check
    expect(row.sidecar_min).toBe(2); // Agent, 10:04:23 to 10:06:23
    expect(row.idle_min).toBe(3); // one 180 s gap after the Edit result
    expect(row.pre_edit_chars).toBe(44); // Read result 40 chars + sed result 4 chars
    expect(row.slips).toBe(1); // the sed -i call only
    expect(row.compactions).toBe(1);
  });

  test("table prints a header and one row", async () => {
    const table = formatTable([await analyzeFile(FIXTURE)]);
    const [header, data] = table.split("\n");
    expect(header.startsWith("agent")).toBe(true);
    expect(header).toContain("verify_min");
    expect(data).toContain("fixture01");
    expect(data.split(/\s+/)).toContain("0.83");
  });
});

describe("analyzeFile on waits, overlaps, compaction and a synthetic line", () => {
  const FIXTURE_2 = join(import.meta.dir, "fixtures", "agent-fixture02.jsonl");

  test("idle counts the wait after a turn ends, up to the next injected message", async () => {
    // 10:06:10 text-only turn end to 10:26:10 coordinator message (20 min), and the synthetic limit line
    // at 10:29:36 to 10:32:36 (3 min).
    expect((await analyzeFile(FIXTURE_2)).idle_min).toBe(23);
  });

  test("overlapping Agent and verify calls count as the union of their intervals", async () => {
    const row = await analyzeFile(FIXTURE_2);
    expect(row.sidecar_min).toBe(5.83); // 10:00:10 to 10:06:00, not 4:50 + 5:49
    expect(row.verify_min).toBe(2.17); // 10:26:20 to 10:28:30, not 2:01 + 2:09
  });

  test("a synthetic line is not a turn, and compaction time is model time", async () => {
    const row = await analyzeFile(FIXTURE_2);
    expect(row.turns).toBe(5);
    expect(row.calls).toBe(5);
    expect(row.wall_min).toBe(32.77);
    // lead-ins 10, 10, 10, 65 (10:28:30 result to 10:29:35, across the compaction), 0, 10 s plus 1 s, 1 s spans
    expect(row.model_min).toBe(1.78);
    expect(row.compactions).toBe(1);
  });
});

describe("writesFile", () => {
  const cases: [string, boolean][] = [
    ["sed -i '' 's/a/b/' notes.txt", true],
    ["perl -pi -e 's/a/b/' file.ts", true],
    ["cat > out.txt <<'EOF'\nhello > world\nEOF", true],
    ["echo a | tee notes.txt", true],
    ["make > build/out.log", true],
    ["grep -n 'a => b' src/x.ts", false],
    ["bun test x 2>&1 | tail -3", false],
    ["npm run check > /dev/null 2>&1", false],
    ["make > /private/tmp/out.log", false],
    ["perl -e 'alarm 280; exec @ARGV' -- grep -i foo x", false],
    ["sed -n 400,406p file.ts | grep -i foo", false],
    ["grep tee notes.txt", false],
    ["cat <<'EOF'\nline > with a redirect-looking arrow\nEOF", false],
    ['git commit -q -m "fix: a > b\n\nbody"', false],
    ["wk edit @t --text $'comment=don\\'t > stop'", false],
    ["S=/private/tmp/claude-501/x; mkdir -p $S/soak && cat > $S/soak/out.txt", false],
    ["S=/private/tmp/x; echo hi > $TMPDIR/z", true],
    ["sed -i '' -e 's/^a$/b/' /dev/null", true],
  ];
  for (const [command, expected] of cases) {
    test(`${JSON.stringify(command)} -> ${expected}`, () => {
      expect(writesFile(command)).toBe(expected);
    });
  }
});
