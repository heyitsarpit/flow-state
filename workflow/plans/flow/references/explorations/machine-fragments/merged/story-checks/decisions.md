# Story checks: owner decisions

How a test checks a Story. Accepted 2026-11-01. **Merged into `machine-design.md` on 2026-11-01** ([merge-plan.md](merge-plan.md)), where C*n* is cited as SC*n*; kept as the record behind it. The sections below stay as written at the time.

| # | Decision | Date |
| --- | --- | --- |
| C1 | A Story is a transcript of inputs and checkpoints. Flow owns no assertions: `.expect` leaves the Story, and tests use the runner's own `expect`. | 2026-11-01 |
| C2 | Keep the word `checkpoints`. No `at` until it does something extra; no callback form. | 2026-11-01 |
| C3 | Q1 B: short reads on a checkpoint, for every runner. `lane(O.x, key)` is `undefined` when the lane does not exist; `records(kind, filter?)` is NEW on a checkpoint. | 2026-11-01 |
| C4 | Q2 A: no matchers for now. `toHaveLane`, `toHaveRecord` and `toBeIn` are deferred ([revisit.md](../../revisit.md)). | 2026-11-01 |
| C5 | Q3 A: checkpoint names are camelCase by convention, so destructuring works. | 2026-11-01 |

```ts
// checkout.story.ts
export const busyThenPaid = Story.make(Checkout, { id: "checkout/busy-then-paid", world: [Stripe.busyOnce()] })
  .send(E.Pay({ card }))
  .checkpoint("paying")
  .advance("2 seconds")
  .checkpoint("paid")

// checkout.test.ts
test("busy then paid", async () => {
  const { paying, paid } = (await busyThenPaid.run()).checkpoints
  expect(paying.state).toBe(S.PAYING)
  expect(paying.lane(O.pay, pi)).toMatchObject({ pending: true })       // NEW: lane
  expect(paid.lane(O.pay, pi)).toBeUndefined()                          // settled: the lane is gone
  expect(paid.records("ending", { operation: O.pay })).toHaveLength(1)  // NEW: records on a checkpoint
})
```

## The Stories walk

Owner's answers while walking the merged Stories design group by group. Also for inclusion later.

| # | Decision | Date |
| --- | --- | --- |
| W1 | Group 1, Q1 B: `Story.app`, `Story.machine` and `Story.fragment`, so the kind is visible on the line. Reverses T3's `Story.make`; the options and steps per subject stay. | 2026-11-01 |
| W2 | Group 1, Q2 A: `process()` is removed; each step settles (T5 B1 confirmed). | 2026-11-01 |
| W3 | Group 1, Q3 A: `together` is the one word for races (T4 confirmed). | 2026-11-01 |
| W4 | Group 1, Q4 A: real host work pending during a settle fails with `HostTimeWait` (T7 confirmed). | 2026-11-01 |
| W5 | `enter` and `leave` stay as steps for a fragment alone. The rest of that group (`guards`, `reset`, the stand-in host) is still to be walked. | 2026-11-01 |
| W6 | Group 2, Q5 A: one `advance`, with `{ next }` and `{ to }`. | 2026-11-01 |
| W7 | Group 2, Q6 A: `next` names its timer by address; nothing matching fails with `NoDeadline`. | 2026-11-01 |
| W8 | Group 2, Q7 A: `advance` runs the whole chain, in the fixed order at equal instants. | 2026-11-01 |
| W9 | Group 2, Q8 A: keep `advance(d, { suspended })`. | 2026-11-01 |
| W10 | Group 2, Q9 A: `together({ advance })` for a deadline racing an input. | 2026-11-01 |
| W11 | Group 3, Q10 A: a `Fake` module with server and client halves (T5 B2 confirmed). | 2026-11-01 |
| W12 | Group 3, Q11 A: no ending injection (T2 confirmed). | 2026-11-01 |
| W13 | Group 3, Q12 A: `world` as an option and a step, with controls as data. | 2026-11-01 |
| W14 | Group 3, Q13 A: `handle` returns `{ truth, response }`, so order cannot be confused (Effect's `Ref.modify` is `[result, next]`, the reverse of the merged tuple). | 2026-11-01 |
| W15 | Group 3, Q14 A: no MSW binding now ([revisit.md](../../revisit.md)). | 2026-11-01 |
| W16 | Group 3, Q15 A: `Fake.fetch` routes by method and path, such as `{ "POST /confirm": "confirm" }`; the function stays for unusual cases. Spelling to check against the desk's five fakes. | 2026-11-01 |
| W17 | `Fake` stands alone with its own narrow set of capabilities. A mocking library is optional, and goes inside a handler or a plain Layer if a user wants one. | 2026-11-01 |
| W18 | Group 4, Q21 A: `hold`, `release`, `drop` and `duplicate` as a Story-owned wire layer. | 2026-11-01 |
| W19 | Group 4, Q22 A: `hold` stands until `release`; `drop` and `duplicate` apply once; `times` overrides. | 2026-11-01 |
| W20 | Group 4, Q23 A: keep `at: "request" \| "response"` on the wire. | 2026-11-01 |
| W21 | Group 4, Q24 A: keep `release({ drop: true })` and `release({ nth })`. | 2026-11-01 |
| W22 | Group 5, Q25 A: every step has a cut; frames are per publication; no `frames` option (T5 B4 confirmed). | 2026-11-01 |
| W23 | Group 5, Q26 A: one `read(target)` for actors, fakes and endpoints, beside C3's `lane` and `records`. | 2026-11-01 |
| W24 | Group 5, Q27 A: `inspection`, `entity(Entity, key)`, `attempt(O.x)` and `now` live on the checkpoint. `Story.inspection`, `Story.entity`, `Story.attempt`, `Story.records` and `Story.now` go. This settles C3's related proposal. | 2026-11-01 |
| W25 | Group 5, Q28 A: `Story.property` and the `properties` option go; tests loop over `run.frames`, which exposes `truncated`. `propertyTest` takes its checks as its own option (group 8). | 2026-11-01 |
| W26 | Group 6, Q29 A: `reload` and `openTab(name, { from })`. | 2026-11-01 |
| W27 | Group 6, Q30 A: one `dispose` with `{ how: "now" \| "forget" }`. | 2026-11-01 |
| W28 | Group 6, Q31 A: `Fake.storage`, with `seed` and `from`. | 2026-11-01 |
| W29 | Group 6, Q32 A: hydration sources run against this run's fake servers and cannot set `world`. | 2026-11-01 |
| W30 | Group 7, Q33 A: an invisible stand-in host, placed by the fragment's declaration alone. | 2026-11-01 |
| W31 | Group 7, Q34 A: `guards(answers)` as a step, defaulting to allow. | 2026-11-01 |
| W32 | Group 7, Q35 A: `enter(input, { subject })` and `reset(subject)`. | 2026-11-01 |
| W33 | Group 7, Q36 A: `leave({ end: true })` ends a frozen trait. | 2026-11-01 |
| W34 | Group 7, Q37 A: `run.calls` and `checkpoint.exit` go; callbacks and exits are records. | 2026-11-01 |
| W35 | Fake gaps, Q17–Q20: direction approved, final spellings delegated to the main session and an Opus review ([fakes-v2.md](fakes-v2.md)). The owner has not yet read the spellings. | 2026-11-01 |
| W36 | Group 8, Q38 A: `Fake.fetch` and `Fake.webSocket` on Effect's injection points, spelled as in [fakes-v2.md](fakes-v2.md). | 2026-11-01 |
| W37 | Group 8, Q39 A: stream controls are ordinary wire steps, with no stream-specific step words; `.do(…)` goes. Details wait for the streams merge. | 2026-11-01 |
| W38 | Group 8, Q40 A: `propertyTest(story, …)` with plain function properties; domains become a preset. | 2026-11-01 |
| W39 | Group 8, Q41 A: `model()` is removed. Exhaustive paths and shortest counterexamples are given up; one Runtime and one execution path stay (T1 confirmed). | 2026-11-01 |
| W40 | Group 8, Q42 A: coverage and CLI as walked; `flow story describe` loses its expectation and property lines, and `flow story run` reports what ran, with no pass or fail on correctness. | 2026-11-01 |
| W41 | Process: amend Stories into a new proposal, then two rounds of Opus deep review covering Stories, fakes and how they integrate; a third round is allowed for major issues. | 2026-11-01 |
| W42 | Owner confirmed: `latency` and `response` as an Effect are cut, so a slow answer is `hold`, `advance`, `release`; this changes W17, where an async library goes in the client half. | 2026-11-01 |
| W43 | Owner confirmed: `run({ signal })` is removed, changing Testing O8; a run never yields to the host. | 2026-11-01 |

## Proposed, not decided

- `@flow-state/vitest` and `storyTest` are not added (this follows from C2–C4; COVERAGE section 6 and its Q4 still name them).
- `inspection` and `entity` move onto the checkpoint like `records`.
- `checkpoint(name, { at })` needs no rename now that `at` is not a read.

## To settle when this is included

- T5 B3 (`expect` makes `run()` reject) and `StoryExpectationFailed` go; `run()` should still reject on a real Story error, so typed checkpoints are always present ([Testing.plan](../../../../../Testing.plan) O5 keeps earlier checkpoints after a failed capture).
- Reads over a whole run, such as "this never shows": `Story.property` or a frames read.
- What leaves with `expect`: its five matching rules. Check how vitest's `toMatchObject` treats a key listed as `undefined`; `Story.attempt` needs a plain read (a desk design gap).
- What `expect` was used for elsewhere: `.expect` lines in `machine-design.md`, streams (`expect(…, { connections })`), and the Stories in the desk and Checkout (hyphenated names, `storyTest`).
- Type check the reads.
- Do this before streams merges, because streams uses `expect`.
