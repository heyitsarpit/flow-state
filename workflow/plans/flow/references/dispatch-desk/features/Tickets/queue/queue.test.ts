import { expect, test } from "vite-plus/test";
import { Ticket, TicketsDomain } from "../ticket.domain.js";
import { Queue } from "./queue.definition.js";
import {
  North,
  assigned,
  degraded,
  mineOnly,
  paged,
  renamedElsewhere,
  searched,
} from "./queue.story.js";

const { S } = Queue;

// List lookups the adapter actually received, from the run's trace (Inspection plan O4).
const listLookups = (trace: ReadonlyArray<{ _tag: string; read?: string }>) =>
  trace.filter((event) => event._tag === "LookupStarted" && event.read === "tickets.list").length;

test("normalised search shares one cache entry", async () => {
  const run = await searched.run();
  // Loaded, then "Lobby ": two list lookups. "lobby" has the same key, so none more.
  expect(listLookups(run.trace)).toBe(2);
});

test("mine only lists the signed-in dispatcher's tickets", async () => {
  const run = await mineOnly.run();
  const mine = TicketsDomain.list.get(run.checkpoints.mine, {
    workspaceId: "north",
    assignee: "dispatcher-7",
  });
  expect(mine?.data.flatMap((page) => page.tickets).map((t) => t.ticketId)).toEqual(["T-42"]);
});

test("LoadMore appends pages until there are none", async () => {
  const run = await paged.run();
  const lane = (name: "two-pages" | "all-pages") =>
    run.checkpoints[name].actor(North).snapshot.activities.list;
  expect(lane("two-pages")?.data?.length).toBe(2);
  expect(lane("all-pages")?.data?.flatMap((page) => page.tickets)).toHaveLength(45);
  expect(lane("all-pages")?.hasMore).toBe(false);
});

test("an unavailable list degrades the queue and backs off", async () => {
  const run = await degraded.run();
  expect(S.DEGRADED.is(run.checkpoints.degraded.actor(North).snapshot)).toBe(true);
  // The first backoff poll comes five seconds (plus jitter) in, and it fails again.
  expect(run.checkpoints["first-backoff-poll"].now).toBeLessThan(10_000);
  expect(S.DEGRADED.is(run.checkpoints["first-backoff-poll"].actor(North).snapshot)).toBe(true);
});

test("an assignment shows at once and repairs the filtered list and the count", async () => {
  const run = await assigned.run();

  expect(
    Ticket.get(run.checkpoints.predicted, { workspaceId: "north", ticketId: "T-43" }, ["assignee"]),
  ).toMatchObject({
    data: { assignee: "dispatcher-7" },
    pending: true,
  });

  const settled = run.checkpoints.settled;
  const open = TicketsDomain.list.get(settled, { workspaceId: "north", status: "open" });
  expect(open?.data.flatMap((page) => page.tickets).some((t) => t.ticketId === "T-43")).toBe(false);
  // Repairs are cumulative from the run's start, so select the ones this write caused.
  const byAssign = settled.repairs.filter((repair) =>
    repair.causes.some((cause) => cause.write === "tickets.assign"),
  );
  expect(new Set(byAssign.map((repair) => repair.read))).toEqual(
    new Set(["tickets.list", "tickets.openCount"]),
  );
});

test("a pushed rename reaches every copy and repairs only what can be wrong", async () => {
  const run = await renamedElsewhere.run();
  const pushed = run.checkpoints.pushed;

  expect(
    Ticket.get(pushed, { workspaceId: "north", ticketId: "T-43" }, ["title"])?.data.title,
  ).toBe("Fix the loading dock door");
  // The open count reads only status, which the push did not change: no repair from it.
  const byPush = pushed.repairs.filter((repair) =>
    repair.causes.some((cause) => cause.push === "tickets.events"),
  );
  expect(new Set(byPush.map((repair) => repair.read))).toEqual(new Set(["tickets.list"]));
});
