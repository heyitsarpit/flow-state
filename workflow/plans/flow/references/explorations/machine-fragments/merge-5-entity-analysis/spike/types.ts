// Type checks for the condition operators and predictions. `tsc -p .` must report no errors: every
// expected-error line below must be an error (the review record lists each message), and every positive line
// must compile with the exact type asserted.
import { and, asc, eq, gt, isNull, lt, not, or, read, serverMatches, write } from "./flow.ts";
import type { Condition, Expr, Fields } from "./flow.ts";
import { archiveUsers, react, setLike, ticketList } from "./domains/ops.ts";
import type { OccurrenceRow, TicketListInput, TicketRow } from "./domains/ops.ts";
import { Issue } from "./domains/issues.ts";
import { Ticket } from "./domains/tickets.ts";
import { Message, User } from "./domains/extras.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>() => undefined as unknown as T;
declare const record: Fields<TicketRow>;
declare const input: Fields<TicketListInput>;
declare const occ: Fields<OccurrenceRow>;
declare const at: Fields<{ at: Date }>;
const tickets = read(ticketList).list(Ticket, ({ result }) => result.tickets);

// Positive (three assertions and five allowed forms).
assert<Equal<typeof input.status, Expr<"open" | "assigned" | "closed"> & unknown>>();
const c1 = and(eq(record.workspaceId, input.workspaceId), or(eq(record.status, input.status), serverMatches(input.search, record.title)));
assert<Equal<typeof c1, Condition>>(); // an optional input and serverMatches under `or` are legal: maybe, not an error
const c2 = and(lt(occ.startsAt, at.at), not(lt(record.updatedAt, 5)), isNull(record.assignee));
assert<Equal<typeof c2, Condition>>();
// A runtime function is typed by the write's input and the record beneath.
write(setLike).predicts(({ input }) => Issue.patch(input.key, { liked: input.liked, likes: (i, input) => i.likes + (input.liked ? 1 : -1) }));
write(archiveUsers).predicts(({ input }) => User.patch(input.keys, { status: "archived" })); // an array key
// The lint's code fix-its for legacy.ts, compiled here (main.ts checks they are byte-identical):
tickets.where(({ input, record }) => or(eq(record.status, "open"), eq(record.assignee, input.assignee)));
tickets.where(({ input, record }) => and(eq(record.workspaceId, input.workspaceId), eq(record.status, "open")));

// Negative: each line must be a type error, most with a sentence.
// @ts-expect-error ordering a string: "gt, gte, lt, lte, between and overlaps order numbers and Dates; …"
gt(record.title, "m");
// @ts-expect-error ordering a Date against a number
lt(occ.startsAt, 5);
// @ts-expect-error a wrong constant: "eq compares two values of one type …"
eq(record.status, "archived");
// @ts-expect-error a Date against a string: "eq compares two values of one type …"
eq(occ.startsAt, "2026-01-01");
// @ts-expect-error isNull on a field that cannot be null: "isNull needs a nullable field"
isNull(record.title);
// @ts-expect-error JavaScript arithmetic on a recorded value
const bad1 = record.updatedAt + 1;
// @ts-expect-error a sort key is a field, not arithmetic
tickets.orderBy(({ record }) => [asc(record.updatedAt - 1)]);
// @ts-expect-error `.where` needs a condition, not a JavaScript boolean
tickets.where(({ record, input }) => record.workspaceId === input.workspaceId);
// @ts-expect-error a condition is not a key
write(setLike).predicts(({ input }) => Issue.patch({ id: eq(input.key.id, "x") }, { liked: true }));
// @ts-expect-error a runtime function's result has the wrong type
write(setLike).predicts(({ input }) => Issue.patch(input.key, { likes: (i) => i.title }));
// @ts-expect-error a runtime function's input is the write's input: there is no `nope`
write(setLike).predicts(({ input }) => Issue.patch(input.key, { likes: (i, input) => input.nope }));
// @ts-expect-error a runtime function that closes over the recording `input`: Ref<boolean> and boolean have no overlap
write(setLike).predicts(({ input }) => Issue.patch(input.key, { likes: (i) => i.likes + (input.liked === i.liked ? 0 : 1) }));
// @ts-expect-error the record beneath is DeepReadonly: a function may not mutate it (push does not exist on a readonly array)
write(react).predicts(({ input }) => Message.patch(input.key, { reactions: (m) => { m.reactions.push({ emoji: "x", count: 1 }); return m.reactions; } }));
// @ts-expect-error a Date beneath offers its getters only (setTime does not exist on ReadonlyDate)
write(setLike).predicts(({ input }) => Issue.patch(input.key, { title: (i) => { (i as unknown as { d: import("./flow.ts").DeepReadonly<Date> }).d.setTime(0); return ""; } }));
// @ts-expect-error a Map beneath is a ReadonlyMap (set does not exist)
((m: import("./flow.ts").DeepReadonly<Map<string, number>>) => m.set("a", 1))(new Map());
// @ts-expect-error `.predicts` returns changes
write(setLike).predicts(() => true);

// Not caught by types (the lint's job): `?:`, `&&`, `||` over recorded values all compile.
tickets.where(({ record }) => (record.title ? eq(record.status, "open") : eq(record.status, "closed")));
export {};
