# Example: Context Lineage

A context-provider DAG carries actor identity and revision cuts to every descendant.
This Spec shows how a persistent ancestry index reconciles shared paths and retains
edge debt without rescanning each ancestor for every consumer.

```spec
spec ContextLineage
status       proposed
basis        inferred from existing behavior
location     .agents/skills/code-spec/references/examples/context-lineage.md
realized-by  packages/flow-state-rewrite/src/runtime-next/context/lineage-model.ts
             packages/flow-state-rewrite/src/runtime-next/context/lineage-trie.ts
             packages/flow-state-rewrite/src/runtime-next/context/lineage-view.ts
             packages/flow-state-rewrite/src/runtime-next/context/lineage.ts
             packages/flow-state-rewrite/src/runtime-next/context/context-debt.ts
             packages/flow-state-rewrite/src/runtime-next/context/context-participant.ts
             packages/flow-state-rewrite/src/runtime-next/context/context-coordinator.ts
             packages/flow-state-rewrite/src/runtime-next/actor/actor-directory.ts
implements   R1 R2 R3 R4 R5 R6
provides     reconcileContextLineage
             planContextLineage
             reconcileContextEdgeDebt
             reconcileOwnedContextDebtBatch
             mergeContextLineageDeltas

requirements
    R1
        source  confirmed by packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts,
                "merges shared ancestry only when all providers attest one exact cut"
        must    combine every provider cut and its ancestors by actor key; shared keys
                agree only when actor identity and revision are both exact

    R2
        source  confirmed by packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts,
                "rejects recycled actors, consumer cycles, and invalid revisions before changing inputs"
        must    reject a mismatched actor key, a negative or unsafe revision, a recycled
                identity for an existing key, or the consumer in its own ancestry

    R3
        source  confirmed by packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts,
                "retains debt until an exact covering revision arrives";
                packages/flow-state-rewrite/src/runtime-next/context/lineage-model.ts defines coverage
        must    retain an edge obligation until the covered cut has the same actor
                identity and an equal or newer revision

    R4
        source  inferred from packages/flow-state-rewrite/src/runtime-next/context/context-debt.ts
                and packages/flow-state-rewrite/src/runtime-next/context/lineage-trie.ts
                inherited-debt selection
        must    admit a newly inherited cut only when the provider's current ancestry
                contains it; keep previously recorded edge debt until it is covered

    R5
        source  confirmed by packages/flow-state-rewrite/src/runtime-next/context/lineage.ts
                and packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts;
                tests check
                input preservation, owned cuts, and unchanged result identity
        must    leave caller-owned inputs unchanged, own every cut that crosses into
                production lineage, and return the previous lineage when unchanged

    R6
        source  confirmed by packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts,
                "plans a deep production lineage path without revisiting every ancestor"
                and "merges a repeated diamond ladder with bounded ancestry work and exact debt"
        must    reuse shared ancestry so deep paths and repeated DAG joins do not
                enumerate every inherited cut once per descendant

open
    RK1 ContextLineage imposes no maximum key length; traversal and retained prefixes
        grow with key length, so key-size policy remains outside this boundary

    RK2 current owner tests do not isolate inherited-cut selection; T7 proposes a direct proof

model
    ActorIdentity = one actor incarnation with a stable key

    ContextCut = { identity: ActorIdentity, revision: non-negative safe integer }

    ContextLineage = immutable mapping from actor key to one ContextCut
        participant lineage holds every provider ancestor and excludes that participant;
        a wave delta may also contain its changed origin cut

    ContextLineageProvider = { slot, cut: ContextCut, lineage: ContextLineage }

    ContextEdgeDebt = mapping from incoming provider key to required ancestor cuts

    ContextFailure = MissingContextProvider diagnostic

    ContextDebtUpdate = { edge, changed, covered, inherited }

owner ContextCoordinator
    lifetime  one registered context graph; each node's lineage and debt last until that node is unregistered
    state     RegisteredContextNode.lineage and RegisteredContextNode.debt

    invariants
        I1 each lineage key equals its cut identity key and each revision is a non-negative safe integer [R2]
        I2 one lineage has at most one cut per actor key; provider paths join only at an exact identity and revision [R1]
        I3 no consumer appears in its own lineage [R2]
        I4 a debt cut is removed only when coverage has the same identity and a sufficient revision [R3]
        I5 newly inherited requirements come only from the provider's current ancestry [R4]
        I6 a failed reconciliation leaves its input lineage and debt unchanged [R5]

operations
    reconcileContextLineage(consumer, previous, providers) -> ContextLineage
        fails      MissingContextProvider
        ensures    returns the union of provider cuts and ancestry, or the previous value when unchanged
        completes  after validation and merge, or a typed conflict

    planContextLineage(node, captured, lookup) -> { providers, lineage, debt }
        fails      MissingContextProvider
        requires   every provider has a captured cut and a live matching lineage node
        ensures    returns one complete lineage and its reconciled edge debt without mutating node state
        completes  after all provider paths reconcile, or a typed stale or conflict failure

    reconcileContextEdgeDebt(previous, edge, required, covered) -> ContextEdgeDebt
        fails      MissingContextProvider
        ensures    returns prior obligations plus uncovered requirements for one edge
        completes  after validation and coverage, or a typed conflict

    reconcileOwnedContextDebtBatch(previous, updates) -> ContextEdgeDebt
        fails      MissingContextProvider
        ensures    applies every direct or inherited edge update to one returned debt value
        completes  after all edges reconcile, or a typed conflict without changing previous debt

    mergeContextLineageDeltas(sources, ownCuts) -> ContextLineage
        fails      MissingContextProvider
        ensures    returns a shared ancestry value containing all compatible source cuts and own cuts
        completes  after validation and merge, or a typed conflict

algorithm
    representation
        store owned lineages as persistent radix tries keyed by encoded actor-key units; expose only an immutable mapping, never trie nodes
        path-copy nodes that change and reuse unchanged subtrees, so sibling lineages retain shared ancestry
        associate each public view with its private root; convert unowned caller maps only after validating their cuts

    reconcileContextLineage
        1. Validate the previous lineage, every provider cut, and each provider ancestry.
        2. Insert each provider cut and its ancestry into one private builder.
        3. At a shared key, require the same actor identity and the exact same revision; otherwise fail with MissingContextProvider.
        4. Reject a result containing the consumer key.
        5. Return the previous value when its cut set already equals the merged result.

    reconcileContextEdgeDebt
        1. Start from the prior obligations for the edge and add newly required cuts.
        2. For a repeated key, keep the greatest required revision only when actor identity is unchanged; otherwise fail.
        3. Remove a retained cut only when coverage has the same actor identity and revision greater than or equal to the requirement.
        4. Return a new debt map; on conflict, leave the prior map untouched.

    reconcileOwnedContextDebtBatch
        1. Reconcile each update against that edge's prior debt and current provider ancestry.
        2. For inherited updates, select newly changed cuts present in the provider ancestry; preserve already recorded obligations.
        3. Settle covered cuts and return the complete debt map only after every edge succeeds.

    mergeContextLineageDeltas
        1. Validate and own unindexed source maps once, then merge source roots and own cuts.
        2. Reuse identical roots and disjoint subtrees; traverse only overlapping trie branches that need reconciliation.

    argument
        actor-key radix paths make lookup proportional to key length; persistent nodes
        preserve shared ancestry across provider DAG branches; exact-cut joins prevent
        a shared key from hiding an incarnation or revision disagreement; edge debt
        uses a separate covering rule because a newer same-incarnation cut can satisfy
        an older requirement

    complexity
        lookup and membership are O(L), where L is the actor key's encoded length in the chosen realization
        owning an unindexed lineage is O(S), where S is the total key length across its cuts
        insertion is O(L) plus the child-map entries copied along the changed path
        owned-root merge is O(V) plus child-map entries copied at rebuilt nodes, where
        V is the visited set of trie-node pairs; identical roots merge in O(1)
        debt reconciliation memoizes each visited root pair per mode and wave, so
        repeated joins pay for distinct changed pairs rather than each repeated path
        iteration is O(P), where P is the number of indexed radix nodes and cuts visited
        space is proportional to new radix nodes, copied child-map entries, and
        distinct root pairs retained by a wave-local debt cache

composition
    flow
        captured provider snapshots
            -> provider cuts and owned ancestry
            -> lineage and edge-debt reconciliation
            -> one participant plan
            -> coordinator commits lineage after no-op or accepted publication
            -> blocked preparation may commit retained debt without changing lineage

    uses
        ContextCoordinator
            kind      owner
            found-in  packages/flow-state-rewrite/src/runtime-next/context/context-coordinator.ts
            role      retain each registered node's lineage and debt, then commit an accepted plan
            reuse     reuse-as-is

        ContextLineage
            kind      protocol
            found-in  packages/flow-state-rewrite/src/runtime-next/context/lineage-model.ts
                      packages/flow-state-rewrite/src/runtime-next/context/lineage-view.ts
            role      carry actor cuts across provider and consumer boundaries
            reuse     reuse-as-is

        PersistentLineageIndex
            kind      transformer
            found-in  packages/flow-state-rewrite/src/runtime-next/context/lineage-trie.ts
            role      index, merge, and share lineage roots behind the immutable mapping protocol
            reuse     reuse-as-is

        ContextDebtReconciler
            kind      transformer
            found-in  packages/flow-state-rewrite/src/runtime-next/context/context-debt.ts
            role      retain and settle required ancestor cuts for each incoming edge
            reuse     reuse-as-is

    boundaries
        ContextCoordinator -> lineage planning
            protocol  captured provider cuts, prior lineage, and prior edge debt
            facts     captured cuts bind an actor incarnation to one observed revision
            hides     radix nodes, merge caches, and cut reconciliation details

        lineage index -> context coordinator
            protocol  immutable ContextLineage mapping
            facts     every cut is keyed by its actor identity and compatible with the joined paths
            hides     trie roots and structural sharing

rules
    publication  commit lineage after a no-op plan or accepted publication;
                 a blocked ancestor may commit retained debt alone while keeping prior lineage
    lifetime     builders belong to one reconciliation; debt-pair caches belong to one context wave
    bounds       each lineage is bounded by the registered graph's configured node capacity; actor-key length has no separate bound

realization effect-v4
    protocol       ContextLineage is exposed as a ReadonlyMap while a WeakMap keeps its private trie root
    key traversal  JavaScript string iteration indexes UTF-16 code units, which defines L for this realization
    failures       Result carries expected reconciliation diagnostics without introducing effects into pure trie operations

coverage
    R1
        enforced-by  I2, reconcileContextLineage steps 2-3
        proven-by    T1

    R2
        enforced-by  I1 I3, reconcileContextLineage steps 1 and 4
        proven-by    T2

    R3
        enforced-by  I4, reconcileContextEdgeDebt steps 1-3
        proven-by    T3 T4

    R4
        enforced-by  I5, reconcileOwnedContextDebtBatch step 2
        open-by      RK2

    R5
        enforced-by  I6, private root ownership, and copy-on-write reconciliation
        proven-by    T1 T2 T8

    R6
        enforced-by  persistent radix paths, subtree reuse, iterative merge, and wave-local pair caches
        proven-by    T5 T6

attacks
    A1 two provider branches attest different revisions for the same actor
        blocked-by  exact-cut join in I2

    A2 an actor key is reused by a later actor incarnation while old debt remains
        blocked-by  identity comparison rejects the cut instead of settling prior debt

    A3 an invalid or self-referential lineage reaches reconciliation
        blocked-by  cut validation and I3 before the result is returned

    A4 a caller changes its source map or cut after planning
        blocked-by  copied owned cuts and private production lineage views

    A5 a deep chain or repeated diamond causes recursion overflow or repeated full ancestry scans
        blocked-by  iterative trie walks, persistent subtree reuse, and wave-local pair caches

    A6 a blocked edge inherits a changed cut that its provider ancestry does not attest
        blocked-by  inherited selection in reconcileOwnedContextDebtBatch

    A7 an unusually long actor key increases indexing work
        outcome  work grows with key length; RK1 leaves actor-key limits unresolved

tests
    T1 shared ancestry merges only for an exact common cut and returns the previous value when unchanged
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T2 recycled identity, consumer cycle, and invalid revision fail without changing previous lineage
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T3 debt survives insufficient coverage, clears at covering revision, and owns its published cut
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T4 incompatible debt or invalid coverage fails without losing earlier requirements
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T5 a 1,024-actor chain plans without revisiting every ancestor
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T6 a 256-level diamond ladder merges within bounded key and map reads, clears exact debt, and rejects a conflicting right branch
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T7 proposed: blocked-edge reconciliation ignores newly changed cuts absent from provider ancestry and preserves existing debt
        packages/flow-state-rewrite/src/runtime-next/test/context-lineage-owner.test.ts
    T8 production lineage views reject map writes and own cuts independently of caller mutation
        packages/flow-state-rewrite/src/runtime-next/test/context-debt-owner.test.ts
```
