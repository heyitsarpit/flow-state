# Coordination and delivery

Read this when a change coordinates owners, admission, publication, sinks, queues, or subscriber delivery.

## CP-13 — Coordinate through an owner

- **Bad:** Recursive downstream callbacks, ignored queue offers, waiting from a lane needed by the awaited wave, or replacing stale ticket inputs with current snapshots.
- **Good:** Callbacks notify a coordinator. Its own fiber captures inputs, offers independent work, and awaits publication/no-op/rejection tickets. Full, stale, suspended, and terminal outcomes settle finitely; healthy branches keep progressing.
- **Keep:** Publication owns lineage and installs compatible ancestor cuts before acknowledgement. The coordinator owns attempts and per-edge debt, merging outstanding cut requirements without completed history. Unrelated events cannot erase debt. No-op lineage reconciliation need not publish a revision or record; admission and resume cross the same coherence boundary. Drain waits for its captured generation, not later roots.

## CP-19 — Keep infrastructure handles private

- **Bad at a public route:** Exposing raw queues, consumer Effects, or Scopes
  where callers need commands and observations. A readonly Queue property still
  permits mutation; a cold consumer Effect can start a second consumer.
- **Good:** Expose typed admission, dispatch, drain, and shutdown at the package
  boundary. The owner starts and supervises one consumer inside its lifetime;
  snapshot reads return values. Fill mailboxes through admission and gate the
  real consumer in tests.
- **Keep:** Check actual package-public routes and their adapters, not every
  internal export or owner field. Infrastructure capabilities intentionally owned
  by a real adapter are not leaks. Do not globally ban Queue or Scope types.

## CP-20 — Share one transition across entrypoints

- **Bad:** Independent synchronous, asynchronous, and prepared paths each validating, advancing counters, consuming reservations, or publishing the same state.
- **Good:** One typed preparation and one shared owner mutation helper. Ordinary
  and prepared entrypoints may differ in admission or waiting, but both invoke the
  same transition and failure policy. A prepared capability attests that fallible
  admission is complete and is non-forgeable by ordinary input.
- **Keep:** Validation, copying, callbacks, clock reads, and sequence allocation out of the interval after irreversible store mutation and before acknowledgement. Test interleaved callers, cancellation, close, and actual store results; failed preparation changes no committed state.

## CP-21 — State retention and delivery semantics

- **Bad:** Assuming bounded ingress bounds downstream buffers, replay-seed
  capacity bounds an active subscriber's unread backlog, or eventual subscription
  closure bounds a slow reader's live retention.
- **Good:** Distinguish replay seed capacity from active-subscriber backlog. State
  the delivery law, retained data, and release event. Choose dropping, coalescing,
  backpressure, or lossless retention only when the consumer contract permits it.
  An arbitrary capacity is not a correctness fix.
- **Keep:** Ordered atomic publications and required activation, latest, suspended, and terminal replay. Each subscription belongs to its consuming Scope and releases on cancellation. Shutdown publishes terminal truth and completes without waiting indefinitely for a paused reader.
- **Be explicit:** Unbounded lossless delivery can retain unbounded lag. A replay slot or documented cost does not change that. Prove release through real acquisition/finalizer observations, not GC timing or fabricated queue counters.

### R-02 — Release the acceptance lock before sink delivery

- **Bad:** Holding the acceptance semaphore while draining sinks. A slow or failing
  sink then blocks new record acceptance and couples commit capacity to delivery speed.
- **Good:** Capture the accepted prefix under the lock, release the lock, and deliver
  that captured cutoff afterward. The committed prefix and sink delivery remain
  separate phases.
- **Review proof:** Interleave acceptance and drain with a slow sink; prove records
  after the cutoff can be accepted and that delivery does not read a moving boundary.

```ts
// Bad: sink delivery runs while the acceptance semaphore is held.
const drain = () => semaphore.withPermit(drainUnsafe());

const drainUnsafe = Effect.gen(function* () {
  for (const sink of sinks) {
    yield* sink.drain();
  }
});

// Good: capture the accepted prefix, then deliver only through that cutoff.
const drain = () =>
  Effect.gen(function* () {
    const cutoff = yield* semaphore.withPermit(
      Effect.sync(() => captureAcceptedPrefix()),
    );

    return yield* deliverSinksThrough(cutoff);
  });
```

### R-03 — Give sink attachment one owner

- **Bad:** Checking only sink shape or private fields before appending a sink. The same
  sink can then attach twice or attach across runtime hubs.
- **Good:** The evidence hub owns sink identity, rejects duplicate same-hub and
  foreign-hub attachment, and records the current sequence as a late-attachment
  baseline. Delivery filters records to the attachment baseline and captured
  cutoff.
- **Review proof:** Test duplicate attachment, mixed-runtime attachment, and late
  attachment against the documented baseline and delivery contract.

```ts
// Bad: shape validation does not establish ownership or prevent duplicate attachment.
if (!sinkInternals.has(sink)) {
  return Result.fail(invalidEvidence("sink"));
}

sinks.push(sink);
return Result.succeed(undefined);

// Good: the hub owns sink identity and records the attachment baseline.
type Attachment = {
  readonly hub: EvidenceHub;
  readonly baseline: number;
};

const sinkOwners = new WeakMap<EvidenceSink, Attachment>();

const attach = (sink: EvidenceSink) => {
  const previous = sinkOwners.get(sink);

  if (previous !== undefined) {
    return Result.fail(
      previous.hub === hub
        ? duplicateSinkEvidence()
        : foreignSinkEvidence(),
    );
  }

  const baseline = currentSequence();
  sinkOwners.set(sink, { hub, baseline });
  sinks.push({ sink, baseline });
  return Result.succeed(undefined);
};

const deliver = (sink: EvidenceSink, attachment: Attachment, cutoff: number) =>
  deliverRecordsThrough(
    sink,
    recordsAfter(attachment.baseline, cutoff),
  );
```

### R-04 — State the slow-reader retention law

- **Bad:** Treating a replay slot as a bound on active subscriber backlog, or
  treating eventual subscription closure as a bound on live unread data. A
  `SubscriptionRef` latest-value read and its change stream are not the same
  retention law: `get` reads the latest value, while `changes` uses unbounded
  active-reader retention unless a contractually bounded delivery mechanism is
  layered around it.
- **Good:** Choose the contractually correct delivery law: latest-value reads,
  explicitly bounded dropping/coalescing delivery, backpressure, or documented
  lossless retention. Document what is retained and which cancellation or shutdown
  event releases it.
- **Review proof:** Use a real slow reader and real producer. Prove ordering or
  coalescing, retention bounds, and shutdown completion without waiting indefinitely
  for the paused reader.

```ts
// Bad: an unbounded queue retains every unread snapshot for a slow reader.
const snapshots = Stream.fromQueue(unboundedSnapshotQueue);

yield* Queue.offer(unboundedSnapshotQueue, snapshot);

// Good: a latest-value read does not promise a bounded change stream.
const latestSnapshot = yield* SubscriptionRef.get(snapshotRef);
const changes = SubscriptionRef.changes(snapshotRef);
```

```ts
// Good alternative: explicitly bound and document dropping/coalescing behavior.
const snapshots = yield* Queue.dropping<ActorSnapshot>(1);
```

### R-05 — Keep raw runtime infrastructure private

- **Bad at a package-public route:** Exposing `Queue`, `Scope`, or a cold consumer
  `Effect` as public fields. A readonly-looking queue is still a mutation
  capability, and a cold consumer can start a second consumer.
- **Good:** Expose typed command admission, dispatch, drain, and shutdown
  operations. The owner starts and supervises exactly one consumer inside its
  lifetime; tests gate that real consumer through public admission.
- **Review proof:** Inspect the actual package-public route and its adapter
  exceptions together. Internal owner fields and exports are not automatically
  public leaks. Prove that callers cannot bypass admission, create an extra
  consumer, or control the owner's lifetime through an infrastructure handle.

### R-06 — Compare admission and provider fences separately

- **Bad:** Comparing every context fact with one ordinary fact fence, or treating a
  provider fence as the admission target fence.
- **Good:** Compare the admission target fence with the current consumer fence,
  then compare each provider fence with the current fence for that provider. A
  projection fact does not gain a consumer field merely because it is a
  projection. Reject or no-op a mismatched ticket according to the contract.
- **Review proof:** Include a mismatched-fence case and prove that a stale or unrelated
  projection cannot deliver into the current context wave.

```ts
// Good: compare the admission target and provider fences independently.
const targetFence = input.fence;

if (!sameFence(targetFence, currentConsumerFence)) {
  return Result.succeed(undefined);
}

for (const provider of contextProviders(fact)) {
  if (!sameFence(provider.fence, currentProviderFence(provider.key))) {
    return Result.succeed(undefined);
  }
}
```
