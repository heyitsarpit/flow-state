# Machine authoring

This document owns accepted revisions for definition and machine grammar, compound-state behavior,
transitions, timers, redirects, and related type semantics. It does not redefine operation execution,
context-provider resolution, actor construction, persistence, React ownership, or Story execution.

## Deletion disposition

The child-machine and old machine-grammar surfaces changed by this chapter are classified by `DEL-002`
and `DEL-005` in `REV-MIG-004`. Those entries own the complete old clause inventory and no-residue
requirements; the `Supersedes` fields below identify the local semantic boundary only.

## Cross-cutting authoring orientation

This section is non-normative orientation and an accepted-surface example. It summarizes rules owned by
`REV-COMP-009`, `REV-COMP-010`, and `REV-OPS-001`; it creates no second owner or additional semantics.

Definition input is part of the static actor shape. For a fresh actor, the pure
`memory: ({ input }) => Memory` initializer consumes it once and is the single inference source for
`InputOf` and `MemoryOf`; omitting the initializer argument fixes input to `void`. Machine callbacks do
not receive the original input, and restoration installs persisted memory without rerunning the
initializer. `REV-COMP-009` owns the full actor-construction consequences of this rule.

`definition(...)` owns static shape and one flat record of named resource, transaction, and stream
descriptors. The machine callback receives that exact `O` catalogue together with actor-bound
`onMemory`, `invalidate`, and `clear` capabilities. `machine(...)` owns behavior, the app closes
ownership and reachability, the runtime Implementation supplies services, and Story fixtures control test
boundaries. Flow has no XState-style `setup()` or
`machine.provide()` layer. Machine code uses the definition's named operation families; it does not
construct resource refs, read generic resource or transaction registries, or route ordinary operation
work through a general activity kit. `REV-COMP-010` and `REV-OPS-001` own those boundaries outside the
state grammar defined here.

```ts
const NewIntent = flow.definition({
  states: ["INACTIVE", { ACTIVE: ["EDITING", "SUBMITTING"] }],
  operations: {
    routeConfig,
    orderById,
    submitIntent,
    submissionProgress,
  },
});

flow.machine(NewIntent, ({ S, E, O, onMemory, invalidate, clear }) => ({
  // machine configuration
}));
```

Listing those descriptors is inert: it performs no acquisition, transaction, or subscription. It makes
the operations part of the machine's static universe so `AppPlan` reachability and exact operation
`A`, `E`, and `R` catalogues can be derived without scanning callbacks.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:219-247,337-360,1202-1210`.

## Definition shape and recursive state grammar

### REV-MACH-001 — Substates replace child machines for state hierarchy

**Change:** Removes the child-machine authoring primitive and assigns state hierarchy to recursive
substates within one actor.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:238-241,1233-1234`.

**Supersedes:** Directly conflicting child-machine clauses; see `REV-MIG-004` for the affected old-clause
disposition.

**Rule:** Flow MUST NOT expose a child-machine primitive or child input, lifecycle, completion,
snapshot, or addressing surface. Recursive substates MUST express hierarchy inside one actor. All
substates MUST share that actor's memory, inherited context, event protocol, mailbox, operations, and
lifetime, and MUST NOT create nested actors.

**Example:** REV-MACH-002 shows the recursive state-list form that replaces child-machine hierarchy.

**Proof obligations:** No additional clause-specific proof was accepted.

## Recursive state grammar and identity

### REV-MACH-002 — State declarations accept recursive named groups

**Change:** Replaces the flat-only state grammar with recursive compound states.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:254-266,1214-1217`.

**Supersedes:** Directly conflicting flat-only state grammar; see `REV-MIG-004` for the affected old-clause
disposition.

**Rule:** The ordered definition state list MUST accept a string leaf or a recursive single-key object
whose property names a compound state and whose value is its ordered child state list. Every leaf and
compound node MUST receive one exact definition-derived token preserving its complete readable path,
such as `S.ACTIVE.S.EDITING`. Transitions MUST use those exact tokens and MUST NOT use relative string
paths, arbitrary node IDs, or runtime path lookup. Deeper state groups MUST use the same recursive
shape.

The grammar is recursive and identical at every accepted level:

```text
StateDeclaration := StateName | { StateName: StateDeclaration[] }
```

The object form has exactly one key. Both its key and every string entry name definition-derived state
nodes; the object is nesting syntax, not a child actor declaration.

**Example:**

```ts
states: [
  "INACTIVE",
  { ACTIVE: ["EDITING", "DEBOUNCING", "QUOTE_ACTIVE"] },
],
```

**Proof obligations:** No additional clause-specific proof was accepted.

### REV-MACH-003 — Machine configuration recursively mirrors compound states

**Change:** Replaces root-level `initial` with `default`, adds a required direct-child default to every
compound node, and recursively extends the existing exact `states` configuration record through the
definition's compound-state hierarchy.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:268-273,1218-1221`.

**Formalization:** The recursively mirrored configuration record and exact-node requirement were accepted
on 2026-08-16 to complete the already accepted compound-state semantics.

**Supersedes:** Directly conflicting root `initial` grammar; see `REV-MIG-004` for the affected old-clause
disposition.

**Rule:** The root machine configuration MUST contain `default` and an exact `states` record containing
every root state declared by the definition. A leaf configuration MUST contain the existing state-node
behavior fields. A compound configuration MUST contain those same behavior fields plus its required
`default` and an exact nested `states` record containing every direct child declared by that compound
definition node. Empty leaves MUST remain explicit as `{}`; omission MUST NOT mean an implicit empty
configuration.

The same configuration shape MUST recurse at every accepted state depth. Event handlers, activities,
timers, and redirects authored on a compound node MUST be siblings of that node's `default` and nested
`states`; child behavior MUST be authored in the corresponding child entry. The compiler MUST recursively
join the definition tree and configuration tree, reject missing, extra, misplaced, or duplicate nodes,
and compile the result into the exact handler and lifecycle tables required by this chapter. Runtime
transition selection MUST NOT perform a dynamic tree walk.

Every root and compound `default` MUST name one exact direct-child token. A transition MAY target an exact
leaf or compound token. Entering a compound token MUST follow its authored default path one compound node
at a time, so every compound token remains independently enterable even when no transition currently
targets it.

**Example:**

```ts
const Editor = flow.definition({
  states: ["INACTIVE", { ACTIVE: ["EDITING", "SUBMITTING"] }],
});

const editorMachine = flow.machine(Editor, ({ S }) => ({
  default: S.INACTIVE,
  states: {
    INACTIVE: {},
    ACTIVE: {
      default: S.ACTIVE.S.EDITING,
      // Compound handlers, activities, timers, and redirects live here.
      states: {
        EDITING: {},
        SUBMITTING: {},
      },
    },
  },
}));
```

**Proof obligations:** Compile proofs MUST accept the recursively mirrored configuration through depth ten
and reject missing, extra, misplaced, or duplicate nodes and non-direct defaults. Runtime proofs MUST show
that entering a compound target follows its authored default path and that execution uses the compiled
tables rather than runtime parent lookup.

### REV-MACH-004 — Compound handlers compile into one unambiguous actor protocol

**Change:** Adds compound-node event handling while preserving machine-wide event identity.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:275-278,296-298,1222-1223,1231-1232`.

**Supersedes:** Directly conflicting flat handler-selection semantics; see `REV-MIG-004` for the affected
old-clause disposition.

**Rule:** Events MUST remain one machine-wide actor protocol. Leaf and compound nodes MAY handle those
events in their own `on` records, but substates MUST NOT introduce nested event catalogues or event
identities. The compiler MUST expand each compound handler across its descendant leaves into an exact
handler table. If an ancestor and descendant declare the same event along one state path, compilation
MUST reject the ambiguity. Flow MUST NOT perform a runtime leaf-to-parent handler search, an implicit
override, or parent fallback after a failed descendant guard.

**Failure behavior:** If both `ACTIVE` and descendant `ACTIVE.EDITING` declare a handler for the same
machine event, compilation fails. Flow does not choose one handler by precedence and does not try the
ancestor when a descendant guard fails.

**Proof obligations:** No additional clause-specific proof was accepted.

### REV-MACH-005 — Public and callback state is the exact active leaf

**Change:** Extends exact state-token observation with hierarchy matching while retaining one active
leaf value.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:280-284,327-330,1224-1226`.

**Supersedes:** Directly conflicting `snapshot.value` and nested-state observation semantics; see
`REV-MIG-004` for the affected old-clause disposition. Other snapshot and view semantics remain untouched.

**Rule:** `snapshot.state` and the `state` passed to every guard, redirect, timer, memory update, and
activity selector MUST be the exact active leaf token. Exact `===` MUST test only that leaf.
`state.matches(token)` and `snapshot.matches(token)` MUST return true for the active leaf and each of
its active ancestors. Flow MUST NOT expose an XState-style nested state value or a separate callback
field identifying the declaration node, because the declaration site already identifies that node.

**Example:**

```ts
snapshot.state === S.ACTIVE.S.EDITING;
snapshot.state.matches(S.ACTIVE);
```

**Proof obligations:** No additional clause-specific proof was accepted.

### REV-MACH-006 — Recursive state depth has one explicit bound

**Change:** Adds a fixed depth limit to the recursive state grammar.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:332-335,1246-1247`.

**Supersedes:** None.

**Rule:** Flow MUST accept at most ten state levels. A top-level state MUST count as depth one, its
child as depth two, and so on. Runtime validation and TypeScript inference MUST use the same bound.
Documentation SHOULD recommend extracting a separate machine when nesting exceeds three levels, but
that guidance MUST NOT become a lower compiler limit.

**Failure behavior:** A declaration at depth eleven MUST be rejected by both the runtime validator and
the TypeScript authoring surface; a declaration at depth four remains valid despite the documentation
guidance to extract a separate machine beyond depth three.

**Proof obligations:** No additional clause-specific proof was accepted.

## Compound-state behavior

### REV-MACH-007 — Compound activities own their full active lifetime

**Change:** Extends state-owned activity lifetimes and ordering to compound states.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:286-294,1227-1230`.

**Supersedes:** None. This extends existing activity ownership to the new compound grammar.

**Rule:** An activity authored on a compound state MUST start when that compound becomes active, remain
alive across transitions among its descendants, and stop only when that compound is exited. Descendant
activities MUST follow their own state membership. Nested activities MUST start parent-to-child and
stop child-to-parent. A transition MUST preserve activities on its unchanged ancestor path and MUST
stop and start only the changed branches. This ordering MUST define nested lifetimes but MUST NOT imply
that asynchronous parent initialization finishes before a child activity starts; required acquired
values MUST belong in resources.

**Proof obligations:** No additional clause-specific proof was accepted.

### REV-MACH-008 — Compound timers retain their original deadline across descendants

**Change:** Extends state-owned timers to compound states.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:300-302,1235-1236`.

**Supersedes:** None. This extends existing timer ownership to the new compound grammar.

**Rule:** A timer authored on a compound state MUST start when that compound becomes active, remain
scheduled across transitions among its descendants, and be cancelled when the compound is exited. A
descendant transition MUST NOT reset the elapsed duration of an unchanged compound timer.

**Proof obligations:** No additional clause-specific proof was accepted.

### REV-MACH-009 — Compound redirects participate in ordered stabilization

**Change:** Extends redirect stabilization to compound states and fixes ancestor-to-descendant order.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:304-312,1237-1240`.

**Supersedes:** Directly conflicting flat redirect-stabilization semantics; see `REV-MIG-004` for the
affected old-clause disposition.

**Rule:** A redirect authored on a compound state MUST remain applicable while any descendant is
active. Stabilization MUST evaluate it whenever the candidate leaf is inside that compound, including
after descendant transitions and memory updates; evaluation MUST NOT be limited to turns targeting the
compound token directly. When several redirects exist on one active path, Flow MUST evaluate nodes
from the outermost active compound through the exact leaf and MUST preserve authored redirect order
within each node. Parent invariants therefore MUST gate descendant-specific redirects while still
allowing both levels to declare redirects.

**Proof obligations:** No additional clause-specific proof was accepted.

### REV-MACH-010 — Terminal-looking leaves do not complete actors

**Change:** Removes the final-state node kind and its completion semantics.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:314-317,1241-1242`.

**Supersedes:** Directly conflicting final-node and actor-completion semantics; see `REV-MIG-004` for the
affected old-clause disposition.

**Rule:** Flow MUST NOT expose a final-state node kind. A terminal-looking state MUST be an ordinary
leaf with no authored transitions or owned work. Entering that leaf MUST NOT complete the actor, emit
parent completion, produce final output, close subscriptions, or stop the mailbox.

**Proof obligations:** No additional clause-specific proof was accepted. Deletion-specific proof is owned
by `REV-MIG-004`.

### REV-MACH-011 — Reentry names an exact active restart boundary

**Change:** Replaces boolean reentry with an exact definition-derived state boundary.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:319-325,1243-1245`.

**Supersedes:** Directly conflicting Boolean reentry semantics; see `REV-MIG-004` for the affected
old-clause disposition.

**Rule:** `reenter` MUST name the exact active state token forming the restart boundary and MUST NOT be
a boolean. Flow MUST release that active node and its descendant path, then enter the transition target
inside that subtree, restarting state-owned activities and timers at the named boundary. The compiler
MUST reject a boundary that is inactive, belongs to another definition, or does not contain the target.
Without `reenter`, unchanged nodes MUST preserve their existing activation and owned work.

**Example:**

```ts
{
  target: S.ACTIVE.S.SUBMITTING,
  reenter: S.ACTIVE,
}

{
  target: S.ACTIVE.S.SUBMITTING,
  reenter: S.ACTIVE.S.SUBMITTING,
}
```

**Proof obligations:** No additional clause-specific proof was accepted.

## Port boundary

Reactive-context declaration, equality, propagation, provider binding, disposal, dehydration, and
hydration are composition rules, not machine-state grammar; `REV-COMP-001` through `REV-COMP-005`
define them. Singleton, toggle, and debounce shorthand remain deliberately deferred and are not
accepted machine syntax. Explicit states and timers remain the baseline while that question is open.

**Provenance (non-normative):** `DESIGN_REVISIONS.md:249-252,1248-1250`.
