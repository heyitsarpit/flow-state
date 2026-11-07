# Converting the dispatch desk and Checkout to the current design

Both apps now use the design in [machine-design.md](../../flow/references/explorations/machine-fragments/machine-design.md) ("MD"), streams and amended Stories included. Everything is uncommitted. Findings below are **proposed**: none is a decision.

## What was checked, and what that proves

**Nothing ran.** No Flow runtime exists, so no Story, test or property test has executed, and no check here has been seen to pass or fail.

Type check, one process at a time, single-threaded (peak about 290 MB, measured on the desk):

```sh
nubx tsc -p workflow/plans/flow/references/typecheck/tsconfig.dispatch-desk.json   # 0 errors
nubx tsc -p workflow/plans/flow/references/typecheck/tsconfig.checkout.json        # 0 errors
nubx tsc -p workflow/plans/flow/references/dispatch-desk/tsconfig.effect-only.json # 0 errors
nubx tsc -p workflow/plans/flow/references/checkout/tsconfig.effect-only.json      # 0 errors
```

[typecheck/standin/](../../flow/references/typecheck/standin/) was copied from the desk trial and widened. Real Effect 4.0.5 types; every Flow type is mine.

| Part | How strict | A pass proves |
| --- | --- | --- |
| `Story`, `Fake`, checkpoint names and reads | strict | the words exist in the design's spelling, and object results (not tuples) |
| `stream`, `Feed.*`, `fills`, failure maps | strict | contract shape; `failure` exhaustive; `fills` a fillable field |
| Names of states, events, operations; memory field types | strict | a wrong name fails |
| Adapters, ports, fakes' client halves | real Effect types | the Effect code types against the ports |
| Machine bodies, fragments, resources, domains, entities, rows other than a stream's | `any` | **nothing**: a wrong word inside them compiles |
| Views, Next, React, hooks | `any` | syntax and imports only |

[typecheck/checks/negative.ts](../../flow/references/typecheck/checks/negative.ts) has 18 lines that must fail, and they do. That shows the stand-ins match the design's words where they claim to be strict, not that Flow can type this.

Two flags differ from `tsconfig.base.json`: `noImplicitAny` is off (machine bodies are `any`, so callbacks would all fail), and `exactOptionalPropertyTypes` is off (`Schema.optional` request fields against the pure server core). `noUnused*` is off as well. So it is not the trial's "no `any`" claim.

**Semantics were read, not run.** One Opus reviewer read every Story and test against MD's settling and wire rules and found 11 real conversion bugs (a batch window never passed, rules set after the send, wrong `outstanding`, old record shapes). They are fixed. Expect more when an executor exists.

## The gate

The apps are **not** in the workspace gate, and conversion does not break it. `nub run check` is `vp check packages/flow-state-rewrite`; tests include `packages/**/*.test.ts`; the root tsconfig references only `packages/flow-state`. Nothing outside `references/` imports these folders, and they import `flow-state`, which paths do not map to `packages/flow-state-rewrite`. So passing `check`, `test` or `verify` says nothing about the apps. `packages/` is untouched. I read the config to answer this and did not run the gate. The app type checks above are manual; to protect them, add them as a script.

## Code lines, before and after

Code lines leave out blanks and comment-only lines. Total 20,282 to 20,623 (+1.7 percent). Files were reformatted with `vp fmt`.

| Feature | Before | After | |
| --- | --- | --- | --- |
| Desk/Tickets/feed | 465 | 472 | +7 |
| Desk/Presence | 387 | 410 | +23 |
| Desk/Assistant | 352 | 364 | +12 |
| Desk/Tickets/technicians | 605 | 607 | +2 |
| Desk/Roster | 1855 | 1827 | -28 |
| Desk/Tickets/editor | 1800 | 1820 | +20 |
| Desk/Tickets/queue | 1351 | 1360 | +9 |
| Desk/Tickets/panels | 447 | 456 | +9 |
| Desk/Tickets (desk Stories, domain) | 921 | 943 | +22 |
| Desk/Comments | 1147 | 1160 | +13 |
| Desk/Attachments | 536 | 541 | +5 |
| Desk/Resolve | 960 | 966 | +6 |
| Desk/Find | 276 | 282 | +6 |
| Desk/testing (fakes, property test) | 1443 | 1577 | +134 |
| Desk/app | 2247 | 2213 | -34 |
| Desk/tools | 801 | 814 | +13 |
| Desk/shared | 11 | 13 | +2 |
| Checkout/Cart | 719 | 739 | +20 |
| Checkout/Pay | 1440 | 1483 | +43 |
| Checkout/Refunds | 274 | 280 | +6 |
| Checkout/testing | 303 | 356 | +53 |
| Checkout/app | 231 | 229 | -2 |

Unchanged in code: Session, Toasts, Shopper, `next/`, Checkout's `adapters/` and `tools/`, `flow.config.ts`.

## What changed, by feature

**Every feature's Stories and tests.** `Story.make` to `Story.app/machine/fragment`; camelCase checkpoints; `storyTest` to one async `test` that runs once and destructures; `Story.entity/records/inspection/attempt` to checkpoint reads; `O.x.get(cut, k)` to `cut.lane(...)`, decided per read (work in progress `toMatchObject`, settled `toBeUndefined` with an earlier defined read where a wrong key could pass). A Story sharing a name with its checkpoint was renamed, or the destructure aliased where others import it.

- **Feed.** The trial's conversion: `delivers`, `position`, `catchUp`, `reconnect`, `idleTime`, `fills`; adapter is the new `feed.socket.ts` service. Fixture is `DeskFeedSocket.layer.pipe(Layer.provide(socketClient(Desk)))`.
- **Presence.** The trial's conversion; new `presence.channel.ts` service. `Viewers` required `me` and the host never passed it: an old bug, fixed in `app/view.tsx`.
- **Assistant.** Machine unchanged; Stories hold before the send, since the stream finishes inside the `Ask` settle otherwise.
- **Technicians.** Pulse is `delivers: "latest"`, one session per technician. `Feed.live()` now comes after the first answer (finding 9). `reconnect` plus `idleTime: "30 seconds"`.
- **Roster.** Audit is `every`, `position: "seq"`, `fills: "audit"`; `memory.cursor` and `after` are gone, read back through `session` records. The poll is a helper shared with the `listen` feed. `failure` is `PollFailed` plus `Feed`. The `initial` guard is gone (Streams T2).
- **Comments, Attachments, Resolve.** Fragment-alone Stories are `Story.fragment`. Upload's wire rules moved to the `world` option, because `enter` sends.
- **Queue, desk.** Batched assigns advance past the resolver's 10 ms window. `advance("2 days")` became 25 hours, same claim.
- **Editor.** `Fake.storage.from(x, { at })` became a prefix Story (finding 1).
- **Fakes.** Object results, `FakeLost`, `pushes` gone (14 writers say `pushed`), 42 route-table routes and no route function left, `socket` a real endpoint.
- **Cart.** `waitsBehindUnsure` loses the first answer and holds the re-send, the only way to see the hold. The hydration source lost its `world` (finding 2).
- **Pay.** `duplicate` lost `at`; reload Stories are app Stories; race order in `voidLostRace` corrected; `challengeAlone` reads before the exit.
- **Refunds.** One `release`, and a held re-send to observe `uncertain`.
- **Property tests.** `Generate.*` to plain step data; `domainPropertyOptions`; `properties` and `whenQuiet`.
- **Presentations.** Four scenes over fragment-alone Stories removed (finding 5).
- **Shared helper.** `unknownWhenLost` rewritten in both apps (finding 13).
- **READMEs.** Status updated, "Pending merge 6" section removed, gap tables regenerated from the code (45 `design gap:` comments). `REWRITE-PLAN.md`, `REVIEW.md` and `COVERAGE.md` are records of their time and still use old words; I left them.

## Design findings

Severity is mine. Each suggested answer is proposed.

### High

**1. `Fake.storage.from(prefix)`: does it read before or after the world is finished?**
- Design: 2.10.4 Storage ("a mid-run store is `from(thatPrefix)`"), against 2.10.2 "Finish the world, then look".
- Code: `dispatch-desk/features/Tickets/editor/editor.tabs.story.ts`, `continuedFromReload` over a prefix ending with a held save: `Fake.storage.from(titleOnTheWire)`.
- Problem: `from`'s only spelling for mid-run storage ends on a hold, and that leaves a parked fiber, so the end-of-run phase releases it. The save lands and the lane record goes. "Nothing from this phase reaches the evidence" does not mention storage. If `from` reads afterwards, the destination restores nothing and every reload-continuation Story tests the wrong case, silently.
- Suggested answer: state that `from` reads the storage at `run.end`, the last cut, before the world is finished.

### Medium

**2. A hydration source cannot hold a commit in flight, so `DehydrateCommitInFlight` needs a pair.**
- Design: 2.10.11, W29.
- Code: `checkout/features/Cart/cart.story.ts`, `cartPage` and `cartHydrated`; `dispatch-desk/tools/findings/dehydrate-commit-in-flight.ts`.
- Problem: the hold moved to the destination's `world`. MD says the source runs against the destination's servers, not that the destination's wire rules cover its requests, and the Stories depend on that. Run alone, the source no longer shows its point.
- Suggested answer: say so in 2.10.11; `match: { tab: "server" }` then targets it.

**3. `lane` has no `outstanding`.**
- Design: 2.10.6's write listing (`queued`, `parked`) against 2.7.8's rows.
- Code: `comments.test.ts`, `refunds.test.ts`, `roster.test.ts`, `technicians.test.ts`, `presence.test.ts` read it through `lane`; `queue.bulk.test.ts` through `operations`. Left inconsistent on purpose.
- Suggested answer: add `outstanding` to the listing.

**4. Forgetting `pushed` is silent.**
- Design: 2.10.4 ("Not added: `pushes`").
- Code: `testing/desk.fake.ts`, `desk.visit.fake.ts`, `desk.technicians.fake.ts`. 14 writers, not the trial's 11. `removeComment`, `archiveTicket`, `resolve` and `dispatch` reach the log only through a helper. A writer left on `step(...)` has right truth and right answer, and no socket frame, with no error or diagnostic.
- Suggested answer: no Flow change; a desk test that every log item appended was delivered, read from `delivery` records.

**5. A presentation cannot show a fragment.**
- Design: 2.10.12, 2.10.13.
- Code: `dispatch-desk/app/presentation.ts`. Comments' `postedInOrder`, `deleteRefused`, `pinned` and Resolve's `wizardAlone` scenes are gone. Coverage of playback is smaller.
- Suggested answer: write app Stories that place those fragments, or accept it; playback.md's question 2 stays open.

**6. A runtime diagnostic has no test form for a bare stream.**
- Design: 2.11.13 (`RegistrationChurn`, `UnprovenValues`), 2.10.14.
- Code: `dispatch-desk/tools/findings/findings.test.ts`: both are `test.todo`.
- Suggested answer: each runtime finding file exports a host and a Story, and the test reads `cp.records("diagnostic")`. This is app work unless `flow check` should claim them.

**7. A machine Story cannot see a `send` to an absent actor.**
- Design: 2.10.6 (`drop`, `verdict`), 2.10.2 (`ActorAbsent` only as a Story step's error).
- Code: `features/Find/find.test.ts`, reading `records("drop")` for `ActorAbsent`, marked `design gap:`.
- Suggested answer: define the record a `send` action to an absent actor leaves.

**8. Private fields: no read shows what a host sees.**
- Design: 2.2.2, 2.10.12.
- Code: `checkout/features/Pay/pay.test.ts`, `challengeAlone`. The old claim "`helpOpened` is hidden" is false now, and the test asserts the opposite.
- Suggested answer: state whether `memory.<instance>` on a host cut omits private fields at runtime. If it does, the claim returns as a host test.

**9. The natural poll is a `Flapping` trap, and the recipe does not cover `latest`.**
- Design: 2.11.10 (8 registered flaps end it), 2.11.12.8 "Polling" says `every`, yet names "the desk's technician pulse", which is `latest`.
- Code: `technicians.contracts.ts`. The old `Stream.prepend([Feed.live()])` registers before the GET, so an offline device registers and dies 8 times, then ends. It compiles, and looks right. Moved after the first answer.
- Suggested answer: a `latest` line in the recipe, plus one sentence: never announce `Feed.live` before the first answer.

**10. A Story named after its main checkpoint is now the default collision.**
- Design: 2.10.1, SC5. Kebab names never collided; camelCase makes most of them collide (the Stories of Checkout and the editor and queue: 22 renamed, the rest aliased at the destructure).
- Suggested answer: say in SC5 that `run.checkpoints.saved` or an alias is fine, and pick a convention: the Story states the scenario, the checkpoint the moment.

**11. A seeded lane has no public shape, and an upgrade Story needs one.**
- Design: 2.10.4 ("`from` is the only form an app can rely on").
- Code: `editor.tabs.story.ts` `seededStaleLane`; `pay.story.ts` `rebindAcrossVersions`, which needs a record from a build that no longer exists, so `from` cannot make it.
- Suggested answer: publish the record shape with Persistence, or document keeping a frozen old setup beside the new one.

### Low

**12. Record fields the tests need are not in the table.** 2.10.6 lists `lane` as identity, `cell`, `before`, `after`, but `pay.test.ts` reads `attempt`, `cart.test.ts` reads `cell.evidence`, `panels.test.ts` reads `change` on `schedule` and `queue.bulk.test.ts` reads `kind` on `store`. List them.

**13. `Outcome` helpers over a generic error.** Design: 2.7.1. `shared/outcomes.ts` used `Effect.catchTags`, which does not type over a generic `E`, and a ternary does not unify (MD says so). It is now `Effect.catch` with `Effect.gen`. Worth a one-line recipe, since every app writes this helper.

**14. `Story.Step` in a `world` option.** Design: 2.10.1 says narrowed to controls. A helper annotated `Story.Step` needs the option to accept the wider type, so the stand-in does. Name the narrowed type, or say the option takes `Story.Step`.

**15. `endpoint` as a function is unchecked.** Design: 2.10.4. `desk.roster.fake.ts` has one PATCH path for three endpoints, told apart by body. A misspelled name is a run-time `NoRoute`. Type its return as endpoint names.

**16. Route table notes.** All 42 real routes fit, so W16's spelling holds. Add to 2.10.4 that the short form is for object bodies only (a signature PUT of bytes and an array body need `input`), and that `::` spells a custom-method colon (4 URLs).

**17. `reset(subject)` does not say how it refills an Input.** Design: 2.10.12. `comments.story.ts` assumes the subject fills `ticketId`.

**18. An import cycle in the fake.** `desk.fake.ts` and `desk.socket.fake.ts` are one server in two files, so `socketClient` takes `Desk` as an argument. A Story importing the socket file first would hit a TDZ error. App-side: move truth to a leaf module.

## Carried from the trial, still open

- The desk's `hello` has no head, so a quiet workspace gets one notice per reconnect until the first entry (MD 2.11.10). The fix is a wire field.
- No Story for a server that pings and never greets.
- `next/http-api.ts` still calls the global `fetch`, so `Fake.fetch` cannot reach the assistant adapter; its fake keeps a client half.
