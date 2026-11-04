# Round 13: status

Status: **proposed**, builder's notes for the mid-session review. Decisions start at D221 (`../convergence-13.md`, written at the end).

## Checkpoint 1: round 12's final review fixed (step 1)

- `round-13/` is a copy of `round-12/`'s code; the runtime changes are in `lane.ts`, `durable.ts`, `turn.ts`, `world.ts`, `gate.ts`.
- **H1 (D221, replaces D217's shape test):** a lane is stamped at mint with the `keyFields` its key was made under (`Lane.keyFields`, saved with the lane). At restore a lane under other fields is rekeyed and restamped only if its stored input has every current key field; else it keeps its old stamp and is an older-key lane. One lookup, `olderKeyLane` (`lane.ts`), by stamp, actor, op and the values of the fields both releases share, is used by the commit (D217's decline), by a keyed `retry(k)`/`cancel(k)` (the hold's way out) and by a keyed guard (`idle(k)`, `retryable(k)`). Pinned: `R13-STAMP-SHAPE` (P1 both orders), `R13-STAMP-RELEASE` (P2 retry and cancel, P3 the guard, another key value, another actor, a lane minted after the release). `d217.any-value` and `d217.any-actor` now die; dropping the stamp comparison is equivalent (a lane under the current fields that agrees on every field is the commit's own lane).
- **M1:** `KeyOf = Pick<TypeOf<I>, K>`; rule 39 keeps optional key fields (an absent field is a key value; the stamp, not the shape, says which release). Pinned in `type-tests.ts` (compiles) and `R13-STAMP-SHAPE` (runs).
- **M2 (D222):** creation is the Schema's constructor (`Struct.make`): an absent input takes its constructor default; a decoding default is restore's only. Four fixtures with a decoding-default input also state the constructor default. Pinned: `R13-CREATE`, `front-check`.
- **M3:** `CompiledFragment` carries `kind`, `events` (`external`, `host`, `internal`, `payloads`) and `ports` (`exits`, `callbacks`, `guards`); `Compiled.events.payloads` holds every event's payload Schemas. `CompiledData`, the seal's closure walk and `flow check`'s `UnknownEvent` (fragment bodies) read them.
- **L1-L6:** three D218 directives (nested, node, subroutine; both mutants die); front-check pins a non-key input field, a two-service op, the seal's `fields`, D124's union; `compare-all` skips by path; L6's stale rows gone.

Suite: 761/761, lock clean, exit 0 [ran]. Types: 16 directives [ran]. Front: 58 pins [ran]. CLI pins pass [ran].

## Checkpoint 2: the story prototype and the three commands (steps 2, 3)

- `round-13/story/`: `fake.ts` (`Fake.server`, `Fake.call`, `Fake.control`, wire words `hold`/`release`/`drop`), `story.ts` (`Story.machine`, `Story.fragment` with a stand-in host built through the compile API, the steps' data forms, `run()` on the round 13 runtime with the world settled between the runtime's settles, a cut per step, checkpoint reads: `state`, `memory`, `operations`, `lane`, `read(server | endpoint)`, `records`, `attempt`, `now`). Eight Stories: Checkout (paid, pressed twice, busy then paid, reload mid-charge), 3-D Secure alone (timed out, help and back), the desk (rename latest, archive twice). Their tests and the Story errors: `checks/story-check.ts` (53 checks) [ran].
- `flow story list | describe | run`, `flow trace <id> [--at cp]`, `flow graph <machine>` in `cli/`; pins in `cli/main.ts` [ran].
- **`flow graph`'s gate** (`conformance/graph.ts`, `conformance/graph-gate.ts`): every `turn` the runtime writes now names each part's alternative (`definition`, `at`), node and the moved incarnation. On the suite without searches: 73,257 turns, 73,334 parts, 736 edges over 56 machines, **0 disagreements** after three graph fixes (fillings run from the host's leaf, under the placing node; a `whenAbandoned` callback runs in the leaving turn, and a resumable one's from anywhere) and one fixture fix (`cells.ts` declared no `AbortPay`). Taken 468; not taken but guarded 185; not taken and unmarked 76; marked unreached 5, unsourced 3; one event sent only by the suite (`CartLoaded`).

Next: api-changes, the gate with searches, the gates on the final commit, RESULTS, convergence-13.
