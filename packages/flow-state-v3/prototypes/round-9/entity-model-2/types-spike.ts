// Type spike for the public shapes that contradicted each other in the first proposal (review M6). Not the API's implementation: its types only.
// Run: node_modules/.bin/tsc --ignoreConfig --noEmit --strict --moduleResolution bundler --target esnext --module esnext --skipLibCheck <this file>. Every @ts-expect-error must be a real error.
declare const brandSaid: unique symbol;
declare const brandPredicted: unique symbol;
type Said = { readonly [brandSaid]: true };
type Predicted = { readonly [brandPredicted]: true };
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Target<F, Shape> = { readonly fields: F; readonly shape: Shape };
type Entity<F, K extends keyof F, Ver extends keyof F> = Target<F, F> & {
  readonly key: K;
  readonly version: Ver;
  pick<P extends keyof F>(...p: P[]): Target<F, Pick<F, P>>;
  row(r: F): Said; // listen: a whole row
  delta(key: Pick<F, K>, fields: Partial<Omit<F, K | Ver>> & Pick<F, Ver>): Said; // listen only: what changed, at which version
  delete(key: Pick<F, K>, o?: { version: F[Ver] }): Said;
  patch(key: Pick<F, K>, fields: Partial<Omit<F, K | Ver>>): Predicted; // `.predicts` only
  get<P extends keyof F>(s: unknown, key: Pick<F, K>, pick?: Target<F, Pick<F, P>>): { data?: Pick<F, P>; predicted: boolean; uncertain: boolean; unconfirmed: boolean; missing: boolean };
};
declare function entity<F, K extends keyof F, Ver extends keyof F>(d: { fields: F; primaryKey: K[]; version: Ver }): Entity<F, K, Ver>;

type Contract<I, O> = { readonly input: I; readonly output: O };
type HasKey<F, K extends keyof F, X> = [X] extends [Pick<F, K>] ? true : false; // the key is in the output or the input, by name

type Write<I, O, F, K extends keyof F> = {
  // Where a row's key comes from: the output, else the input by name, else `.byKey`.
  one<S>(
    t: Exact<S, O> extends true ? Target<F, S> : never,
    ...k: HasKey<F, K, O> extends true ? [] : HasKey<F, K, I> extends true ? [] : [{ byKey: (i: { input: I }) => Pick<F, K> }]
  ): Write<I, O, F, K>;
  predicts(f: (a: { input: I }) => Predicted): Write<I, O, F, K>;
};
declare function write<I, O, F, K extends keyof F>(c: Contract<I, O>, e: Target<F, F> & { key: K }): Write<I, O, F, K>;
type Read<I, O, F, K extends keyof F> = {
  // A list row has no input to borrow from: the key must be in the pick.
  list<P extends keyof F>(t: [K] extends [P] ? Target<F, Pick<F, P>> : never, select: (a: { output: O }) => ReadonlyArray<Pick<F, P>>): Read<I, O, F, K>;
};
declare function read<I, O, F, K extends keyof F>(c: Contract<I, O>, e: Target<F, F> & { key: K }): Read<I, O, F, K>;
declare function listen<Ev>(c: Contract<{}, Ev>): { as(es: unknown[], f: (e: Ev) => Said | ReadonlyArray<Said>): void };

type Row = { workspaceId: string; ticketId: string; title: string; slug: string; archived: boolean; revision: number };
const Ticket = entity({ fields: {} as Row, primaryKey: ["workspaceId", "ticketId"], version: "revision" });
type Key = { workspaceId: string; ticketId: string };
const saveTitle = {} as Contract<Key & { title: string }, { title: string; revision: number }>;
const archiveNoKeyInInput = {} as Contract<{ slug: string }, { archived: boolean; revision: number }>;
const list = {} as Contract<{}, { rows: Array<Pick<Row, "workspaceId" | "ticketId" | "title" | "revision">> }>;
const feed = {} as Contract<{}, { _tag: "p"; k: Key; title: string; revision: number }>;

// section 3's headline: compiles. The key is in the input, by name.
write(saveTitle, Ticket)
  .one(Ticket.pick("title", "revision"))
  .predicts(({ input }) => Ticket.patch({ workspaceId: input.workspaceId, ticketId: input.ticketId }, { title: input.title }));
// the input has no key: `.byKey` is required, and then fine
write(archiveNoKeyInInput, Ticket).one(Ticket.pick("archived", "revision"), { byKey: () => ({ workspaceId: "w", ticketId: "t" }) });
// @ts-expect-error the input has no key and no `.byKey`
write(archiveNoKeyInInput, Ticket).one(Ticket.pick("archived", "revision"));
// @ts-expect-error `.one(Ticket)` over a two-field answer: H2's A1, now a type error
write(saveTitle, Ticket).one(Ticket);
// @ts-expect-error a pick that does not match the output
write(saveTitle, Ticket).one(Ticket.pick("title"));
// a list's pick has its key: compiles
read(list, Ticket).list(Ticket.pick("workspaceId", "ticketId", "title", "revision"), ({ output }) => output.rows);
// @ts-expect-error a list row without its key
read(list, Ticket).list(Ticket.pick("title", "revision"), ({ output }) => output.rows);
// a view's pick needs no key: it was handed one
Ticket.get({}, { workspaceId: "w", ticketId: "t" }, Ticket.pick("title")).data?.title;
// delta in listen: compiles, and needs the version
listen(feed).as([Ticket], (e) => Ticket.delta(e.k, { title: e.title, revision: e.revision }));
// @ts-expect-error a delta with no version
listen(feed).as([Ticket], (e) => Ticket.delta(e.k, { title: e.title }));
// @ts-expect-error a prediction is not evidence: patch in listen
listen(feed).as([Ticket], (e) => Ticket.patch(e.k, { title: e.title }));
// @ts-expect-error evidence is not a prediction: delta in predicts
write(saveTitle, Ticket).predicts(({ input }) => Ticket.delta(input, { title: input.title, revision: 1 }));
