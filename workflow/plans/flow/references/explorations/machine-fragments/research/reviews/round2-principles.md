# Round 2 review: principles, prior art, simplicity, coverage

Same lens and severity scale as [round1-principles.md](round1-principles.md). I checked each
proposal's revision log against its rules and code, not the log alone. Line numbers (Lnn) refer to
the revised proposal. The simplicity audit is in [round2-simplicity.md](round2-simplicity.md).

Status words: **done** (the text and examples agree), **partly**, **rejected** (with my verdict on
the reason), **ignored**.

---

## 1. sonnet-single-fragment.md

### Round 1 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Argue single vs split, or forbid stateless-in-states | **done, by concession** | L28-36 withdraw the "two copies of Field" claim and call the split "a mechanical rename". Shape is derived from config (rule 1, L838). Single is kept only "as the brief requires" (L1108), so principle 2 is still partly unmet (weakness 1). |
| 2 | Outcome division | **done** | Host maps success and its tags (L465-481); fragment maps the rest (L382-387, rule 12). |
| 3 | Entry snapshot and admission | **done, another way** | Placement `input` and `start` read a staged post-patch snapshot (rule 4, L846-851). Steps with `start` are barred from default paths (rule 5, check 11). |
| 4 | Raise composition table | **partly** | Rule 8 (L862-876) covers alternatives, `check` order and unhandled. It does not say whether `"self"` counts as the one allowed state change. Debounce and AutoSave fuse two `"self"` handlers. |
| 5 | Abandoned route and full AutoSave | **partly** | The `abandoned` route exists (L891-896), but it maps only success, failure and unknown, so an abandoned `interrupt` or `defect` goes nowhere. "A part's commit is never abandoned" (L896) is false for a part inside a step (L26). AutoSave now has a full host (L667-710). |

### Rejections

- **Event or payload in placement input** (L1112: "entering transitions are heterogeneous, and a
  union type would be wrong"). Weak. opus-single (`S.X.enter`) and codex-split (`S.X.call.from`) put
  the mapper on each entering edge, so each mapper sees its own event type. The staged snapshot
  works, but only if the host first copies the exit payload into its own memory.
- **Fragment-declared senders** (L1121: "a host that wants a field typed into directly"). Unsound.
  That is convenience, not a correctness failure case (principle 8), and the fragment-declared
  `events` list already gives direct typing.

### Newly wrong

1. **Major. Poll contradicts rule 12.** "A `send` while one is outstanding rejects the turn" (L900).
   Poll's `Tick` sends every 5 s and claims "refetch joins, never stacks" (L542). With a slow server,
   every Tick turn is rejected instead of joined.
2. **Major. A payload-only commit select cannot reach the host's keys.**
   `O.Notes.save.commit(({ payload }) => ({ body: payload }))` (L690) has no `noteId`. The fragment's
   request Schema must then carry the key, and no example shows it.
3. **Major. Two snapshot rules in one turn.** Raised parts read pre-turn (L862, L876); entered steps
   read staged (L846). Nothing says whether "staged" includes raised handlers' patches. L876 ("O3
   unchanged") contradicts L848 and L1063 (an O3 amendment).
4. **Major. Whole-turn decline can lose a terminal delivery.** If a reply, exit or timer handler
   raises into a child that refuses, the whole turn declines and the reply is consumed with nothing
   published (see §7, shared gap 1).
5. **Major. Projection defects are not covered.** A throwing outcome mapper enqueues nothing
   (Machines O3), so the request waits forever.
6. **Minor.**
   - The shape trigger `start` sits in config (L19, L838), but every example writes it in `build`
     (L391, L539).
   - AutoSave maps `unknown` to `Failed` and drops the Attempt (L635); it also fails its own check 18.
   - Rule 2 (all earlier results fenced) contradicts rule 12 (abandoned commits delivered).
   - For a part nested in a step, rule 7's "may target a host state" is ambiguous; the outer host
     would be an E3 hidden ending.
   - `fallback` and `ignore` appear in no example.
   - How `request.fixture` produces results with no host outcome table is unexplained (L922).

### Must fix before round 3

1. Make the `abandoned` route total (all outcome kinds), and cover parts inside steps.
2. Resolve "one outstanding call" against refetch joining (Poll), and show the commit key in the
   request Schema.
3. Make terminal deliveries (reply, exit, timer) total under whole-turn decline, and route projection
   defects to `defect`.
4. One snapshot rule per turn: say what "staged" includes, and whether `"self"` counts as a state
   change.
5. Put fragment-declared senders in place of `expose`, or give a correctness case for `expose`.

---

## 2. opus-single-fragment.md

### Round 1 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Forbid stateless-in-states | **done** | Kind is derived (rule 2, L891); one placement per kind (rule 4, L896). L32 concedes "the split's placement rule under one name". |
| 2 | Replace the step model with fusion | **done** | Rule 14 (L940-945): every part reads pre-turn; `start` reads only `input` (rule 18). D6 is admitted open (L1015). |
| 3 | Explicit sender lists | **done** | `events`, `hostEvents`, `internalEvents` (rule 12, L930-934). |
| 4 | Outcome division, payload-only select, abandoned route | **mostly** | Rules 19-23; bindings at L479-495 and L719-731. The request kind is implied by whether the fragment declares `unknown`, so binding a `commit` to a fragment without `unknown` is unspecified (D4). |
| 5 | `.reply` versus Testing O3 | **done, as a named amendment** | L817-823. |

L35-37 claim that only rules 4 and 18 are kind-specific. Rules 3, 5, 6, 10 and 26 are too, so the A3
"prevents" verdict (L1021) is overstated.

### Rejections

- **Fixtures for fragment Stories** (L821: "a fragment owns no operation, so a fixture would need a
  fake operation descriptor per test"). Partly sound. codex-single and codex-split show the
  alternative: one binding in the Story plus a Layer fixture. That costs a binding per test, not a
  descriptor per test, and it keeps Testing O3 intact.
- **Optional raise marker** (L1124: "an escape hatch with no failure case"). Sound, provided terminal
  deliveries stay total (§7, shared gap 1).

### Newly wrong

1. **Major. Rule 24 contradicts Persistence O6.** "A pending commit reply restores as `unknown`"
   (L978). The plan says only work with an acknowledged Attempt restores as unknown; work never
   acknowledged ends `interrupt`.
2. **Major. Unlisted plan changes.**
   - Required success and failure-tag mapping (check 2) against Operations O2 "each outcomes member
     is optional".
   - The `abandoned` handler "runs as a later host turn" (L975) in whatever state the host is in. That
     is a new turn source and a new handler scope. It is undefined when the placer is itself a step
     that has been left.
3. **Major. Projection defects are not covered.** The call stays pending, and rule 21 then blocks
   every resend. Checkout's PLACING has no way out but its exits (L730), so it is stuck for good.
4. **Major. Whole-turn decline can lose a terminal delivery.** Same as sonnet-single 4.
5. **Minor.**
   - A step that is the *default* of another step has no entering transition to supply its input.
     Rule 18 covers only root defaults.
   - The `abandoned` handlers disagree on whether `attempt` is nullable (L491 vs L731).
   - `.reply` has two forms (by name at L838, by kind at L842).
   - `story.fragment` cannot send `hostEvents`, so Debounce (input only via a hostEvent) cannot be
     tested alone.
   - AddressStep trips its own warning 14.
   - `props` has three roles, and handlers use both `event` and `payload`.

### Must fix before round 3

1. Fix restore against Persistence O6 (acknowledged → `unknown`, else `interrupt`).
2. Declare the request kind; list every Operations and Machines amendment (required mappings, the
   abandoned-route turn).
3. Route projection defects to `defect`; make reply, exit and timer deliveries total.
4. Define input for nested step defaults, and let `story.fragment` drive `hostEvents`.
5. Pick one `.reply` form, or move to fixtures.

---

## 3. codex-single-fragment.md

### Round 1 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Argue the kinds honestly; drop "either" | **done** | Required `kind: "embedded" \| "state"` (L18, L43-45). L36 concedes "no lifecycle advantage". Split names rejected (L1872). |
| 2 | `start` instead of zero-delay | **done** | L431-434, L1382-1388; READY and Begin gone. |
| 3 | Denied raise declines whole turn | **done, but see new item 1** | Rule 3.3.2 (L1446-1450), `check` parity (L1468-1474). |
| 4 | Fragment-declared senders, one meaning for `events` | **done** | L50-52, L1410-1416; `exposes` removed. |
| 5 | Embedded callbacks may target; generated harness | **done** | Owning-node rule (L69-71, L1395-1406). `story.fragment` with fixtures, no injection (L1585-1612). |

### Rejections

- **Split names** (L1872: "not adopted in this single-constructor proposal"). That is circular, not a
  reason. But the brief assigned a single constructor, and `kind` is the split with a discriminant.
  Acceptable.
- **`guard().optional()`** (L1879: "a security/admission capability should be reviewed at each
  placement"). Sound under correctness first.

### Newly wrong

1. **Blocker. Whole-turn decline breaks the totality of replies, exits and timer notifications.**
   - A reply slot is consumed "before its receiving transition" (L1509).
   - If that transition, even its unguarded fallback, raises into a child that refuses, the whole
     alternative declines (L1446).
   - A declined turn publishes nothing, so the reply is lost and the fragment waits with no call
     outstanding.
   - L1486 admits it ("a reconciliation problem") but gives no mechanism.
   - The same applies to exit continuations and to Debounce's `Due` → `onSettled` → raise.
   - D4 and A6 "prevents" overclaim. codex-split fixed this with a totality rule; borrow it.
2. **Major. Callbacks inside `actions` are same-turn transitions.** `Due: { actions:
   [props.onSettled] }` (L188) expands into a host transition to SETTLED (L207). Machines O3 `actions`
   are finite work started after publication, and receive `now`. One array now mixes two semantics,
   and no amendment lists it.
3. **Major. Three snapshot views in one turn:** pre-turn for guards and updates; post-patch parent
   memory for entry `input`; fresh child memory for `start` and embedded inputs. The same
   `props.send.from(({ memory }) => …)` reads different memory in `start` (L473) and in `actions`
   (L497).
4. **Minor.**
   - Vocabulary rose to about 34 identifiers. The log's "removed return-route vocabulary" (L1876) is
     false: the term is still at L24, L760, L83, L1549, L1568.
   - `input` has six roles, including the Story namespace `E.input`.
   - `.from` has two signatures.
   - Exits have two spellings (L916, L922).
   - Poll needs dead handlers for replies that cannot occur when E = never.
   - The `hostEvents` row says "ordinary owner handler" (L51), against L1415.
   - `fragment.prop` (live) and the `lookup` kind are never shown.
   - L1371 says "public event" while examples enter by exit continuation (L633).

### Must fix before round 3

1. Terminal deliveries (reply, exit, timer) must be total: raises from them target statically total
   commands (codex-split L1052-1053), or are forbidden.
2. Move callbacks out of `actions` (a `notify` field, or callbacks as raises), or amend O3 explicitly.
3. One snapshot rule for selectors, with entry input as the only staged read.
4. Cut vocabulary: fix the log's claim, give `input` one role, one exit spelling.
5. Show live props and a `lookup` request, or drop them.

---

## 4. sonnet-split.md

### Round 1 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Path-addressed events replace spread and `forward` | **done** | `events` and `hostEvents` (rule 8, L916); send path equals read path (L763). Forwarding inside a fragment remains for nested children (L954, AddressStep L332-343), and the proposal says so. |
| 2 | Remove implicit payload copy | **done in substance** | Rule 9 says "always `.from`" (L917), yet bare payload-free tokens are used (L193, L342, L468). Reword to "bare only when payload-free". |
| 3 | Rename one `start` | **done** | `S.X.with(f)` for entry (rule 7); `start` means first actions only. |
| 4 | Outcome division; what composed parts read | **done, with gaps** | `request.commit` / `request.read` (L81-91), rule 14, and pre-turn reads (rule 9). `request.read` has no example. Nothing stops mapping a failure tag onto `reply.success`; codex-split's class grouping is missing. |
| 5 | Complete AutoSave host | **done** | NoteEditor (L766-824). L827 still names `Saved` (now `SaveSucceeded`). |

### Rejections

- **Merge `P` and `props`** (L1048: tokens and values "exist in different phases … the thing A4
  forbids"). Sound. opus-single and codex-split use one name, but they accept a token/value
  ambiguity to do it.

### Newly wrong

1. **Major. Testing O3 conflict, unnamed.**
   - `replies([{failure:"Busy"}, "unknown", …, "never"])` (L864) scripts the fragment's results with
     no operation, which is injection.
   - L1009 calls it "(not injection)" instead of naming an amendment.
2. **Major. A second call is answered `SendInterrupted`** (L105). That overrides the descriptor's
   `allow`, `serialize` and `cancel` concurrency (Operations O3), and no plan change lists it.
3. **Major. Gaps that leave a fragment waiting:**
   - An unmapped `success` (Operations O2 members are optional) leaves the fragment waiting.
   - Projection defects are not covered.
   - The `abandoned` payload type is undeclared (L807 uses `payload.outcome`).
   - A fragment exit or a trait callback target taken while a call is outstanding has no route
     (check 12 covers only host leave paths).
4. **Major. Whole-turn decline can lose a terminal delivery** (same as sonnet-single 4).
5. **Minor.**
   - D3 says "no depth limit" (L22), while check 14 caps paths at ten segments.
   - TicketEditor's `unsure` blocks deleting for good with no reconcile path (L563).
   - Story tests reference an undefined `Req` (L870) and out-of-scope `c`.
   - `canEdit: deny("Locked")` passes a value where a guard function is expected (L898).
   - "About 14 new words" (L1014); its own ledger lists about 25.

### Must fix before round 3

1. Name the Testing amendment for scripted replies, or move to fixtures with a binding.
2. Respect descriptor concurrency, or list the override as a plan change.
3. Require `success`; group mappings by outcome class; route projection defects; make
   reply/exit/timer deliveries total.
4. Type the `abandoned` payload (with the Attempt), and cover exits and trait targets taken while a
   call is outstanding.
5. Show `request.read`, or cut it.

---

## 5. opus-split.md

### Round 1 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | One turn model | **partly** | Fusion with whole-turn decline (rule 9, L145-156). Staged `input`/`start` is a declared exception (L104-111, L1133; reason D6, sound). Whether `"self"` counts toward "at most one fused part may target" (L154, check 7) is open. If it does, §6.2 (QueryChanged `"self"` + Input `"self"`) and every Field callback with a target are illegal. |
| 2 | Restore live values | **partly** | `live` is back (L27-28, L46), but no numbered rule mentions it and no full example uses it. L46 says requests read "neither `live` nor host memory (type-enforced)", contradicting the read select at L714 and L725-727. |
| 3 | Trait callbacks target | **partly** | Rule 6 (L120-121) allows it. No example shows it, and the `"self"` question may make it unusable. |
| 4 | Entry input timing and default paths | **mostly** | Rule 2: staged snapshot plus the event or exit payload. Rule 3 and check 10 ban input/start subroutines on default paths. A root trait with `input` activates at admission (Signup L520) with no defined snapshot or event. |
| 5 | Request kind, relay, abandoned | **done, with gaps** | `kind` (L124); relay shown (L1032); `abandoned` required (rule 7). Where a relayed child's `abandoned` goes is unspecified. Exit-to-enclosing-exit fillings (L1029-1037) are an undefined form. |

### Rejections

- **Fixtures for fragment Stories, rejected "for now"** (L1147-1156, L1443). Weak, as for
  opus-single: one Story binding plus a Layer avoids the Testing amendment.

### Newly wrong

1. **Major. The Checkout double-order claim is false** (L991-993). The scenario:
   - Cancel while PLACING is in flight (`attempt` still null).
   - Re-enter and confirm. The new PLACING sends again.
   - Under `allow` that is a double order. Under `reject`, `notSent` leads to backoff, the first
     order succeeds, and the retry places a second.

   L5 is honestly labelled "by convention" (L1222); only the prose overclaims.
2. **Major. Unlisted plan changes.**
   - Required failure-tag mapping, and "omitted means routed to the fragment" (against Operations
     O2's optional members).
   - The `abandoned` route as a turn source with no event (Machines O3, Inspection).
3. **Major. Projection defects are not covered.** SENDING or VERIFYING waits forever.
4. **Major. Whole-turn decline can lose a terminal delivery** (shared gap 1).
5. **Minor.**
   - "Eight ports" (L66), but the table has nine.
   - The machine's `E` includes children's hostEvents and the definition's does not; never stated.
   - Rule 7's "select receives only `payload`" is not split by kind.
   - D5 says in-flight commits restore as `unknown`, while rule 7 sends never-invoked ones to
     `notSent`.
   - §6.7's "component" is four loose lines.

### Must fix before round 3

1. Say whether `"self"` counts as a target; show a trait callback that targets.
2. Give `live` a rule and a full example; fix the read/commit select contradiction (one rule).
3. Define root-trait input at admission and the relay's `abandoned`; drop the double-order claim or
   enforce it.
4. Route projection defects; make terminal deliveries total.
5. List the Operations O2 and Machines O3 amendments; reconsider fixtures for Stories.

---

## 6. codex-split.md

### Round 1 must-fix

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Whole-turn decline; total `Replace`; drop `check` dry-run | **done / done / rejected** | Rule 4 (L971-972), §4.3 (L1029-1039), `RaisedCommandUnhandled`. `Replace` is total (L259-267). New rule: a raise reachable from a reply or return must target a statically total command (L1052-1053). The staged dry-run is gone, but `check` still evaluates payload mappers that feed composed guards (L1068-1073). |
| 2 | `start` actions instead of event plus READY | **done, adapted** | `start` is a transition `{ target, actions }` (L64-65, L999-1001), so a wizard can call its first child (L444). Stateless steps write `start: { target: "self" }` (L282, L403). |
| 3 | Abandoned route | **done, beyond the request** | Required `abandoned` with `pending` plus every terminal (L1140-1162); `flow check` errors on any departure path without one. |
| 4 | Trait callbacks target | **done** | Within the containing scope (L510-514); DebounceHost OPEN→LOCKED (L486-492). |
| 5 | Outcome division by kind; generated harness | **done / partly** | `kind` commit/read; host maps success and tags; system kinds go to the fragment, and the host may not map them (L1077-1100). `story.fragment` exists (L1213-1236), but see new item 1. |

### Rejections

- **Keeping mapper evaluation in `check`** (L1522: "a child guard on a transformed payload cannot be
  evaluated without that pure payload mapping"). Sound. The cost is a Machines O4 amendment
  (mappers may throw from `check`), which is listed (L1461).
- **`() => true` guards** (L1533). Sound, as for codex-single.
- **Optional raise** (L1509). Sound.

### Newly wrong

1. **Major. `story.fragment` cannot bind guards or seed trait input.** Its options are `id` and
   `requests` (L1261-1276). So RequiredField, whose `canEdit` is required, is tested through a host
   (L1254), and "host refuses" (principle 10) is not shown alone.
2. **Major. Two shapes for one request binding.** In production:
   `({ reply }) => ({ actions: [O.x.commit(select, { outcomes })], abandoned })`. In tests:
   `({ reply }) => ({ operation, select, outcomes })` (L1264). Two canonical forms (constraint 7).
3. **Minor (plan amendments missing).**
   - `abandoned` handlers patch host memory on late outcomes and may declare finite actions
     (L1143-1157). That is a new delivery path, with no Machines O3 or Operations amendment row.
4. **Minor.**
   - `replies` still names the contract's reply declaration (L54, L303) as well as the handler
     block. The log's fix (L1529) covers only one of the two.
   - §4.3-4.4 are still not in plan vocabulary, despite L1534.
   - "Required raise" wording implies an optional raise that does not exist.
   - Event and exit share the name `Back` (L395, L400), and a reply and an exit share `Rejected`.
   - Required empty contracts appear: `events: {}`, `exits: {}`.
   - RenameHost treats an abandoned `Busy` (refused, no write) as unresolved (L714).

### Must fix before round 3

1. Let `story.fragment` bind guards, props and trait input; demonstrate "host refuses" alone.
2. One request-binding shape in production and tests.
3. List the abandoned-route amendments (late memory patches, actions).
4. Cut the vocabulary and rule sprawl (see round2-simplicity.md): one numbered rules list.
5. Imply `start: { target: "self" }` and `exits: {}` for stateless or exitless steps.

---

## 7. Across proposals

### Convergence since round 1 (now near-settled)

All six now agree on these points:

- **Two kinds**, enforced by types. The three single proposals derive the kind (sonnet-single,
  opus-single) or declare it (`kind`, codex-single). Each concedes it is the split under one name.
- **The fragment declares its senders.** Five of six use `events` / `hostEvents` / `internalEvents`.
  sonnet-single keeps host `expose`.
- **A denied or unhandled raise declines the whole transition**, and `check` agrees.
- **Live values and frozen `input` both exist**, decided by "fixed for the activation, or current?"
- **Always-there callbacks may target within their own node**; step callbacks never leave the step.
- **Outcome division:** the host maps `success` and its failure tags; the fragment receives
  `unknown`, `interrupt` and `defect` by request kind.
- **`start` rides the entering transition.** Input-bearing or start-bearing steps cannot be
  defaults.
- **A required `abandoned` route** for commits.
- **Commit selects read the payload only.**
- **`interrupt` for reject or pre-invocation cancel** (or `reject` banned), and **reads restore as
  `interrupt`**.
- **Schema for every declared shape**, except sonnet-single, which still uses TS for value props.

### Shared gaps still open

1. **Whole-turn decline versus terminal deliveries.** I recommended whole-turn decline in round 1.
   codex-single shows its cost:
   - a reply, exit continuation or timer firing is consumed;
   - its handler raises into a child that refuses;
   - the turn declines and publishes nothing, so the delivery is lost.

   Only codex-split closes it (L1052-1053): a raise reachable from a reply or return must target a
   statically total command. All others must adopt that rule and extend it to timer-fired
   notifications.
2. **Projection defects.** A throwing outcome mapper enqueues no event (Machines O3), so the request
   waits forever. Only codex-split closes it, by delivering `defect` (L1124-1127). codex-single closes
   the port until the host leaves. The other four ignore it.
3. **Does `"self"` count as a state change** in "at most one fused part may target" (sonnet-single,
   opus-split)? Unstated. If yes, common examples are illegal.
4. **Unlisted plan amendments.** Required mappings against Operations O2's optional members, and the
   `abandoned` route as a new turn source, are missing in most plan-change lists.
5. **Commit keys under payload-only selects.** The request Schema must carry the key (note id,
   ticket id). Only some examples show it, and sonnet-single's AutoSave cannot.
6. **Testing.** opus-single, opus-split and sonnet-split still inject outcomes (named or not).
   codex-single, codex-split and sonnet-single use fixtures.

### Remaining real disagreements

| Question | Positions | Principles favour |
| --- | --- | --- |
| One or two constructor names | `fragment` with derived or declared kind (three); `trait` / `subroutine` (three) | **Two names.** Every single proposal now concedes the kind exists. A name tells the reader the lifetime at a glance (principle 2) at the cost of one word; codex-single's `kind` field costs three. |
| Entry input: per edge or per placement | per edge: `S.X.enter` (opus-single), `S.X.with` (sonnet-split), `S.X.call.from` (codex-split), transition `input` (codex-single); per placement with staged read: sonnet-single, opus-split | **Per edge.** It types the event or exit payload exactly, needs no staged-snapshot exception for input, and shows the call on the edge. The cost is repeated mappers for several routes into one step, which a named constant fixes. |
| What `start` is | actions (four); a transition `{ target, actions }` (codex-split) | **Actions**, unless a nested wizard must call its first child. codex-split's case is real (L444); actions plus a default child cover it if that child takes no input. Decide by whether a composite step's first child needs arguments. |
| `check` evaluating payload mappers | only codex-split | **codex-split**, if child guards may read transformed payloads. The alternative (forbid transformed payloads into guarded child commands) is simpler but loses a feature. User decision. |
| Testing alone | injection (opus-single, opus-split, sonnet-split); fixtures through a binding (codex-single, codex-split, sonnet-single) | **Fixtures.** Testing O3 stands without an amendment; the cost is one binding per Story. |
| Host `expose` | sonnet-single only | **Fragment-declared senders**; `expose` has no failure case of its own. |

### Who leads, and why

**codex-split leads on correctness**, which ranks first. It is the only proposal that:

- makes terminal deliveries total under whole-turn decline;
- closes projection defects;
- covers `pending` plus every outcome on abandonment;
- bans subroutine defaults outright;
- groups replies by outcome class;
- tests with real fixtures and no injection.

Its weaknesses are readability and brevity: about 36 new spellings, about 60 rules with no single
list, two request-binding shapes, and dense prose. Those are principles 2 and 3, behind correctness.

**opus-split is the best base for readability**: about 25 words, 11 numbered rules and the cleanest
contract table. It still has correctness holes (projection defects, terminal totality, the `"self"`
question, the false double-order claim) and Story injection.

The design that the principles point to is **opus-split's surface with codex-split's semantics**:

- two constructors and three sender lists;
- per-edge entry with arguments, and `start`;
- outcome division by kind, with class grouping;
- the terminal-totality rule and projection-defect closure;
- one abandoned handler `{ outcome, attempt }`;
- fixture-backed `story.fragment`.

opus-single is close behind opus-split, but must fix restore against Persistence O6. The two sonnet
proposals and codex-single trail on open correctness items.
