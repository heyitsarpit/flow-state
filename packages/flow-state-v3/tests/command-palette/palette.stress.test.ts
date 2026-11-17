import { describe, expect, it } from "vite-plus/test";
import { stress } from "../../fixtures/command-palette/stories/usual.ts";
import type { Evidence } from "../../src/host/inspect.ts";
import { played } from "../rules/played.ts";
import { asPalette, pendingAt } from "./reads.ts";

type Ledger = {
  readonly commandOf: ReadonlyMap<string, string>;
  readonly open: ReadonlyMap<string, string>;
  readonly last: ReadonlyMap<string, string>;
  readonly twice: ReadonlyArray<string>;
  readonly strays: ReadonlyArray<string>;
  readonly most: number;
};

const minted = (l: Ledger, attempt: string, command: string) => {
  const other = l.open.get(command);

  return {
    ...l,
    commandOf: new Map(l.commandOf).set(attempt, command),
    open: new Map(l.open).set(command, attempt),
    last: new Map(l.last).set(command, "minted"),
    twice:
      other === undefined ? l.twice : [...l.twice, `${command}: ${attempt} minted while ${other}`],
  };
};

const endedFor = (l: Ledger, attempt: string, channel: string) => {
  const command = l.commandOf.get(attempt) ?? "";
  const open = new Map(l.open);

  if (open.get(command) === attempt) open.delete(command);

  return { ...l, open, last: new Map(l.last).set(command, channel) };
};

const published = (l: Ledger, at: number, errors: Readonly<Record<string, string>>) => ({
  ...l,
  strays: [
    ...l.strays,
    ...Object.keys(errors)
      .filter((key) => l.last.get(key) !== "failure")
      .map((key) => `evidence ${at}: an error on ${key}`),
  ],
});

const recorded = (l: Ledger, e: Evidence, at: number) => {
  if (e._tag === "Minted") return minted(l, e.attempt, String(e.key["command"]));

  if (e._tag === "Ended" && e.attempt._tag === "Some")
    return endedFor(l, e.attempt.value, e.channel);

  return e._tag === "Published" ? published(l, at, asPalette(e.memory).errors) : l;
};

const audited = (records: ReadonlyArray<Evidence>) =>
  records.reduce<Ledger>(
    (l, e, at) => {
      const next = recorded(l, e, at);

      return { ...next, most: Math.max(next.most, next.open.size) };
    },
    { commandOf: new Map(), open: new Map(), last: new Map(), twice: [], strays: [], most: 0 },
  );

describe("command palette: stress (Restore R3, WriteLanes I13, I15)", () => {
  it("PALETTE-14: a hundred and fifty gestures with reloads while commands are pending keep one Attempt per command in flight and every error on a command whose last ending failed", async () => {
    const run = await played(stress);
    const { twice, strays, most } = audited(run.evidence);

    const ended = (channel: string, reason: string) =>
      run.evidence.filter((e) => e._tag === "Ended" && e.channel === channel && e.reason === reason)
        .length;

    expect(twice).toEqual([]);
    expect(strays).toEqual([]);
    expect(most).toBeGreaterThan(1);
    expect(stress.steps.filter((s) => s._tag === "reload").length).toBeGreaterThan(2);
    expect(ended("unknown", "Restored")).toBeGreaterThan(0);
    expect(ended("failure", "CommandFailed")).toBeGreaterThan(0);
    expect(ended("success", "success")).toBeGreaterThan(10);
    expect(pendingAt(run.end)).toEqual([]);
  });
});
