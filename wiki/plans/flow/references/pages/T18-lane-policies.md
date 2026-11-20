---
page T18-lane-policies
---
# Lane policies: what an app author notices (T18, 2026-11-16)

**Bottom line:** a write operation can now say what happens when a second commit arrives while the first is still
out: `latest`, `serialize` or `cancel`, besides `reject`. A commit Flow never sent now ends on its own `notSent:`
channel, and queued commits survive a reload. Reviewed PASS at `e08f59fe`; bench under 0.1 ms per turn.

## Where the value comes from

The operation calls the app's own service; the policy is one field on it.

```ts
const sync = transaction({                       // existing
  id: "Git/sync",
  input: { repo: Schema.String },
  key: ["repo"],                                 // existing: one lane per repo
  concurrency: "serialize",                      // NEW values: "latest" | "serialize" | "cancel" (was "reject" only)
  services: [GitApi],                            // user-defined service, a Layer over fetch in the app
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(GitApi), (api) => api.sync(input, { idempotencyKey: attempt.id })),
});

sync.outcomes({
  success: E.Synced,
  failure: { RateLimited: E.Limited },           // the service's own errors only
  notSent: E.NotSent.from((e) => ({ why: e.why })), // NEW key: Flow never sent it
  unknown: E.Unsure,
});
```

## What each policy does with a second commit

| Policy      | Second commit while one is out                                                     |
| ----------- | ---------------------------------------------------------------------------------- |
| `reject`    | ends `notSent` Rejected at once                                                    |
| `latest`    | waits; a third replaces it (the replaced one ends `notSent`)                       |
| `serialize` | queues in order, up to 64; the 65th ends `notSent` Overloaded                      |
| `cancel`    | the newer commit wins; the older call is interrupted and still gets its own ending |

- The operation's row reads `waiting: true` while commits are queued behind its head.
- Disposing the actor ends queued commits `notSent` Disposed.
- After a reload, queued commits end `notSent` Restored; the head ends `unknown` Restored.

## What changed for existing code

- **Renamed:** `failure: { NotSent: … }` is now a type error; map it with `notSent:` instead. `failure` holds only the
  service's own errors.

## Known gap

- **WriteLanes Q7:** under `cancel`, a replaced commit whose lane ends before its call settles loses its `unknown`
  Restored ending after a crash. Pinned as a failing test; T20 owns the fix.

## Calls made for you to check

- Under `cancel`, a new commit releases the older commit's kept rows (recorded as `letGo`) instead of declining,
  as the Plan's wording reads; no ending is lost.
- A new `fixtures/lanes` shows the policies, rather than switching sync, palette and sign-in over.
