// Type checks for the operator set. `tsc -p .` must report no errors: every @ts-expect-error below must
// be an error (main.ts does not check the reason; the comment states it, and the review record lists the
// compiler message each one gives), and every positive line must compile with the exact type asserted.
import { add, and, asc, coalesce, eq, gt, isNull, lt, not, opaque, or, read, serverMatches, sub, when, write } from "./flow.ts";
import type { Expr, Fields } from "./flow.ts";
import { archiveUsers, issuesInProject, setLike, ticketList } from "./domains/ops.ts";
import type { IssueRow, OccurrenceRow, TicketListInput, TicketRow } from "./domains/ops.ts";
import { Issue } from "./domains/issues.ts";
import { Ticket } from "./domains/tickets.ts";
import { User } from "./domains/extras.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>() => undefined as unknown as T;
declare const record: Fields<TicketRow>;
declare const input: Fields<TicketListInput>;
declare const prior: Fields<IssueRow>;
declare const liked: Fields<{ liked: boolean }>;
declare const occ: Fields<OccurrenceRow>;
declare const range: Fields<{ from?: Date; at: Date }>;
declare const nullable: Fields<{ n: number | null }>;
type ValOf<E> = E extends Expr<infer V, any, any, any> ? V : never;

// Positive: exact inferred types (five assertions).
const likes = add(prior.likes, when(eq(liked.liked, prior.liked), 0, when(liked.liked, 1, -1)));
assert<Equal<ValOf<typeof likes>, number>>();
const status = coalesce(input.status, "open");
assert<Equal<ValOf<typeof status>, "open" | "assigned" | "closed">>();
const c1 = and(eq(record.workspaceId, input.workspaceId), eq(record.status, input.status));
assert<Equal<typeof c1, Expr<boolean, boolean, false, false>>>(); // reads an optional input: only `and` may hold it
const c2 = or(isNull(record.assignee), eq(record.status, coalesce(input.status, "open")));
assert<Equal<typeof c2, Expr<boolean, false, false, false>>>();
const c3 = and(eq(occ.calendarId, "c"), lt(occ.startsAt, range.at), eq(occ.startsAt, range.at));
assert<Equal<typeof c3, Expr<boolean, false, false, false>>>(); // Dates order and compare
// Allowed: a coalesced nullable may be negated; an array key; serverMatches directly under `and`.
not(lt(coalesce(nullable.n, 0), 5));
write(archiveUsers).predicts(({ input }) => User.patch(input.keys, { status: "archived" }));
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ input, record }) => and(eq(record.workspaceId, input.workspaceId), serverMatches(input.search, record.title)));

// Negative: each line must be a type error.
// @ts-expect-error an optional input under `or` (absent would not mean "no constraint")
or(eq(record.status, input.status), isNull(record.assignee));
// @ts-expect-error an optional input under `not`
not(eq(record.status, input.status));
// @ts-expect-error an optional input in `when`'s condition
when(eq(record.status, input.status), 1, 2);
// @ts-expect-error serverMatches under `or`: it may hold for any record, so only `and` may hold it
or(serverMatches(input.search, record.title), isNull(record.assignee));
// @ts-expect-error serverMatches under `not`: it would exclude every record
not(serverMatches(input.search, record.title));
// @ts-expect-error ordering a nullable field under `not`: at null not(lt) is true while gte is false; coalesce first
not(lt(nullable.n, 5));
// @ts-expect-error ordering a nullable field as `when`'s condition, for the same reason
when(gt(nullable.n, 5), 1, 2);
// @ts-expect-error arithmetic in a condition: conditions compare, values compute
eq(record.updatedAt, add(record.updatedAt, 1));
// @ts-expect-error ordering a string: collation is the server's
gt(record.title, "m");
// @ts-expect-error ordering a Date against a number
lt(occ.startsAt, 5);
// @ts-expect-error a wrong constant type
eq(record.status, "archived");
// @ts-expect-error isNull on a field that cannot be null
isNull(record.title);
// @ts-expect-error arithmetic over a nullable number: coalesce first
add(nullable.n, 1);
// @ts-expect-error JavaScript arithmetic on a recorded value
const bad1 = prior.likes + 1;
// @ts-expect-error `when` around changes: the set of changes is structure, not a value
write(setLike).predicts(({ input }) => when(input.liked, Issue.patch(input.key, { liked: true }), Issue.delete(input.key)));
// @ts-expect-error `when` in a key: which records a write predicts is structure
write(setLike).predicts(({ input }) => Issue.patch({ id: when(input.liked, "a", "b") }, { liked: true }));
// @ts-expect-error a predicted value of the wrong type
write(setLike).predicts(({ input }) => Issue.patch(input.key, { title: add(1, 2) }));
// @ts-expect-error the per-field function's result has the wrong type
write(setLike).predicts(({ input }) => Issue.patch(input.key, { likes: (i) => i.title }));
// @ts-expect-error an opaque function's dependencies are typed: the dependency is a number, not a string
opaque([prior.likes], (n: string) => n);
// @ts-expect-error an opaque value is value-only: never in a condition
read(issuesInProject).list(Issue, ({ result }) => result.issues).where(({ record }) => eq(record.likes, opaque([record.likes], (n) => n)));
// @ts-expect-error `.where` needs a condition, not a JavaScript boolean
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ record, input }) => record.workspaceId === input.workspaceId);
// @ts-expect-error a sort key must be a field, not arithmetic
read(ticketList).list(Ticket, ({ result }) => result.tickets).orderBy(({ record }) => [asc(sub(record.updatedAt, 1))]);
// @ts-expect-error the source reader's starting-point fix-it for legacy `status` is rejected here: input.status is optional and not a boolean
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ input, record }) => when(input.status, eq(record.status, input.status), eq(record.status, "open")));
// Its correct form: an absent status means "open".
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ input, record }) => eq(record.status, coalesce(input.status, "open")));

// Not caught by types (the source reader's job): `?:`, `&&`, `||` over recorded values all compile.
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ record }) => (record.title ? eq(record.status, "open") : eq(record.status, "closed")));
export {};
