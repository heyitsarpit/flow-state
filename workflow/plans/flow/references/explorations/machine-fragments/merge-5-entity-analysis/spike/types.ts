// Type checks for the operator set. `tsc -p .` must report no errors: every @ts-expect-error below must
// be an error, and every positive line must compile with the exact type asserted.
import { add, and, asc, coalesce, eq, gt, isNull, not, opaque, or, read, sub, when, write } from "./flow.ts";
import type { Expr, Fields } from "./flow.ts";
import { issuesInProject, setLike, ticketList } from "./domains/ops.ts";
import type { IssueRow, TicketListInput, TicketRow } from "./domains/ops.ts";
import { Issue } from "./domains/issues.ts";
import { Ticket } from "./domains/tickets.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>() => undefined as unknown as T;
declare const record: Fields<TicketRow>;
declare const input: Fields<TicketListInput>;
declare const prior: Fields<IssueRow>;
declare const liked: Fields<{ liked: boolean }>;
type ValOf<E> = E extends Expr<infer V, any, any> ? V : never;

// Positive: exact inferred types.
const likes = add(prior.likes, when(eq(liked.liked, prior.liked), 0, when(liked.liked, 1, -1)));
assert<Equal<ValOf<typeof likes>, number>>();
const status = coalesce(input.status, "open");
assert<Equal<ValOf<typeof status>, "open" | "assigned" | "closed">>();
assert<Equal<typeof input.status, Expr<"open" | "assigned" | "closed", true, false>>>();
const c1 = and(eq(record.workspaceId, input.workspaceId), eq(record.status, input.status));
assert<Equal<typeof c1, Expr<boolean, boolean, false>>>(); // reads an optional input: only `and` may hold it
const c2 = or(isNull(record.assignee), eq(record.status, coalesce(input.status, "open")));
assert<Equal<typeof c2, Expr<boolean, false, false>>>();

// Negative: each line must be a type error.
// @ts-expect-error an optional input under `or` (absent would not mean "no constraint")
or(eq(record.status, input.status), isNull(record.assignee));
// @ts-expect-error an optional input under `not`
not(eq(record.status, input.status));
// @ts-expect-error an optional input in `when`'s condition
when(eq(record.status, input.status), 1, 2);
// @ts-expect-error arithmetic in a condition: conditions compare, values compute
eq(record.updatedAt, add(record.updatedAt, 1));
// @ts-expect-error ordering a string: collation is the server's
gt(record.title, "m");
// @ts-expect-error a wrong constant type
eq(record.status, "archived");
// @ts-expect-error isNull on a field that cannot be null
isNull(record.title);
// @ts-expect-error arithmetic over a nullable field: coalesce first
add(record.assignee, 1);
// @ts-expect-error JavaScript arithmetic on a recorded value
const bad1 = prior.likes + 1;
// @ts-expect-error `when` around changes: the set of changes is structure, not a value
write(setLike).predicts(({ input }) => when(input.liked, Issue.patch(input.key, { liked: true }), Issue.delete(input.key)));
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

// @ts-expect-error the source reader's mechanical fix-it for legacy `status` is rejected here: input.status is optional and not a boolean
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ input, record }) => when(input.status, eq(record.status, input.status), eq(record.status, "open")));
// Its correct form: an absent status means "open".
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ input, record }) => eq(record.status, coalesce(input.status, "open")));

// Not caught by types (the source reader's job): `?:`, `&&`, `||` over recorded values all compile.
read(ticketList).list(Ticket, ({ result }) => result.tickets).where(({ record }) => (record.title ? eq(record.status, "open") : eq(record.status, "closed")));
export {};
