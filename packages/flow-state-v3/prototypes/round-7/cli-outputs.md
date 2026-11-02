# `flow check` and static `flow explain`: exact outputs

Status: **proposed.** Written before the code. A new file; supersedes nothing. Accepted CLI: `check`, `explain`, `graph`, `story list/describe/run`, `trace`. No `flow search`. Exit codes follow CommandLine O3: findings with an error exit 1 and stay on stdout; warnings alone exit 0; an invocation failure exits 2 and writes one document to stderr. `--json` gives one document, one line; text and JSON say the same things.

The prototype takes machines by name (`bun round-7/cli/flow.ts check pay`), since `flow.config.ts` and discovery (CommandLine O6) are not built. Everything reads `Compiled`, and **no callback runs**: every Slot is poisoned first, and the count is printed.

## `flow check`, success

```text
$ flow check typed-pay
flow check: 1 machine, 0 errors, 0 warnings, 2 info
  info  BareWrite          Checkout/Pay  void: maps nothing ...
callbacks run: 0
complete: yes
```

Exit 0.

```json
{"command":"check","machines":["Checkout/Pay"],"summary":{"errors":0,"warnings":0,"info":2},"findings":[],"callbacksRun":0,"complete":true,"incomplete":[]}
```

## `flow check`, failure

One finding per line: severity, rule, machine, path, message. `help:` on the next line. Stable fields: `severity`, `rule`, `machine`, `path`, `message`, `help`, and whichever of `op`, `event`, `state` apply. `path` is `at.path` where the finding has an alternative, else the node.

```text
$ flow check broken
flow check: 1 machine, 2 errors, 1 warning, 0 info
  error  UnresolvedHold  Lab/Broken  operations.charge
         `charge` maps endings but not `unknown`: the lane reaches Held with no handler (rule 45, case 1)
         help: map `unknown` to an event, and handle it where a hold can arrive
  error  Rule20Late      Lab/Broken  states.W
         `Ok` from `charge` can arrive after W is left, and no strict ancestor of W handles it
         help: add a handler at an ancestor; `{ target: "self" }` is the explicit ignore
  warn   Rule16          Lab/Broken  on.Go[0]
         moves to W with a `reject` commit of `charge` and no `charge.idle` guard: a second press moves with nothing sent
         help: add `O.charge.idle` to the guard, so `check()` and the button agree
callbacks run: 0
complete: yes
```

Exit 1.

```json
{"command":"check","machines":["Lab/Broken"],"summary":{"errors":2,"warnings":1,"info":0},"findings":[{"severity":"error","rule":"UnresolvedHold","machine":"Lab/Broken","path":"operations.charge","op":"charge","message":"...","help":"..."}],"callbacksRun":0,"complete":true,"incomplete":[]}
```

### Incomplete analysis

CommandLine O5: missing facts fail rather than claim a complete analysis. A hand-written `Compiled` has no field list, so `KeyRequired` cannot be decided for it, and no declared events, so they are inferred.

```text
complete: no
  KeyRequired not decided for Desk/Tickets: no `keyFields` on rename, archive
  events inferred for Desk/Tickets: `Compiled.events` absent
```

Exit is decided by findings alone; `complete` is in the JSON. **Proposed:** with a typed front end this cannot occur, and then it should be exit 2.

### Rules built

| Rule | Severity | Source |
| --- | --- | --- |
| `Rule20Current`, `Rule20Late`, `Rule20Adopted`, `Rule20NotSent`, `Rule20Read` | error | rule 20 |
| `UnresolvedHold` | error, or warning when only unreachable | rule 45, 2.7.14 |
| `KeyRequired` | error | OD8 |
| `Rule16` | warning | rule 16's last sentence |
| `UnhandledSend` | warning | rule 20's first sentence, narrowed: an event from outside that **no** state handles. A leaf that does not handle one is normal and is not a finding |
| `UnknownEvent` | error | a typed `on` key nothing declares; TypeScript cannot refuse it through the callback (RESULTS) |
| `DuplicateSession` | warning | rule 70 |
| `BareWrite` | info | rule 40 |

## Static `flow explain`

It answers from the table. It runs nothing, so **an opaque guard stops it at `at.path`** and it says so; it never guesses which alternative wins.

```text
$ flow explain typed-pay --state UNSURE --event IntentRead
IntentRead in UNSURE (Checkout/Pay), nearest first
  [0] states.UNSURE.on.IntentRead[0]  -> PLACING
      guard    states.UNSURE.on.IntentRead[0].guard[0]  opaque: stopped here, nothing was run
      memory   states.UNSURE.on.IntentRead[0].updateMemory  opaque
      cancels  pay (Checkout/pay, one lane per intentId)
      commits  place (Checkout/place-order, reject, one lane per cartId)
  [2] states.UNSURE.on.IntentRead[2]  -> PAYING
      guard    pay.retryable, 3 times: a lane fact, known only at run time
      guard    states.UNSURE.on.IntentRead[2].guard[0]  opaque: stopped here, nothing was run
      retries  pay
  [3] states.UNSURE.on.IntentRead[3]  -> self
      always
  [ ] on.IntentRead[0]  -> self    (root)   reached only if every alternative above declines; [3] above cannot decline, so: never
decided statically: no. 2 of 3 alternatives depend on values
```

```json
{"command":"explain","machine":"Checkout/Pay","state":"UNSURE","event":"IntentRead","alternatives":[{"index":0,"path":"states.UNSURE.on.IntentRead[0]","node":"UNSURE","target":"PLACING","guards":[{"kind":"opaque","path":"states.UNSURE.on.IntentRead[0].guard[0]"}],"members":[{"verb":"cancel","op":"pay"},{"verb":"commit","op":"place"}],"certain":false}],"decided":false,"callbacksRun":0}
```

A state and event no table holds:

```text
$ flow explain typed-pay --state CARD --event IntentRead
IntentRead in CARD (Checkout/Pay), nearest first
  [0] on.IntentRead[0]  -> self    (root)
      always
decided statically: yes
```

`flow explain <machine>` with no selector prints the design's one-liners (2.7.16):

```text
PayRequested  * -> PAYING; commits pay (Checkout/pay, reject, one lane per intentId)
```

Unknown state or event: exit 2, `{"error":"InvalidOperand","reason":"UnknownSelector","operand":"..."}` on stderr.

## On paper only: does `flow trace` fold into `explain --trace`?

**Not built.** 2.10.14 has `flow explain --trace <file> --at <checkpoint>`, and CommandLine O4 has `trace summarize` and `trace diff`.

| Command | Question it answers | Folds? |
| --- | --- | --- |
| `explain` (static) | what could happen here | |
| `explain --trace --at` | what happened here, and why this alternative | the same output above, with each `opaque` replaced by the recorded `verdict` |
| `trace summarize` | what happened, in order, across the whole run | **no: no selected point.** As `explain --trace` with no `--at` it would be a different document with the same name |
| `trace summarize --actor/--attempt/--entity` | a filtered timeline | could fold only by making `explain`'s selector grammar carry a timeline's |
| `trace diff` | two runs | **no: two inputs** |

**Proposed:** keep `flow trace` for the timeline and the diff, and let `explain --trace --at` be the only trace form of explain. Folding saves a word and costs two documents behind one command. The static output's `opaque` line is what makes the pair worth having: the same shape, one with values.
