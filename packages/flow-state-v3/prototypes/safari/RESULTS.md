# Safari: the edge's store contract on real Safari

macOS Safari 26.6 (WebKit 605.1.15), driven only through `/usr/bin/safaridriver -p 47812` and WebDriver, from a page on `http://127.0.0.1:47811` served by round 10's `server.ts`. No runtime: `page.ts` measures IndexedDB, Web Locks and bfcache directly, through round 10's `idb.ts` adapter where the edge would use it. Not a gate; the runtime and the suite are unchanged.

**Safety.** The Safari binary was never launched. Each run started its own `safaridriver`, used only the session's own window (and tabs it opened itself), ended with WebDriver's delete session, and stopped that `safaridriver` by its pid. Arpit's Safari (pid 3613) stayed the only `Safari` process throughout [ran].

Run: `bun safari/run.ts --only item0,item1,item1b,item2,item3,item4,item5,item5b` (each item fits a 5-minute run; `--quota '{"chunkMB":50,"maxMB":2000}'`, `--trials N`).

## Verdict

1. **Item 0: a WebDriver session keeps no website data.** Every session is a fresh, ephemeral store. So quota (2) and durability (5) were measured on a store that is not the real one [ran].
2. **A batch issued in `pagehide` as the page enters the bfcache is reported landed when nothing landed.** With `commit()`, all 20 puts fail with `InvalidStateError`, and then `oncomplete` fires, when the page comes back. `oncomplete` was seen in 8/8 logged trials, and the 20 failed puts counted in 5/5. The disk stayed empty in all 26 trials. The adapter answers `true` on `oncomplete`, which breaks the edge's "true: all of it landed" [ran].
3. **Without `commit()`, the same batch stays open while the page is frozen, and it holds the store.** The next page, which is now the owner, hangs on any read of that store until the cached page comes back, when the batch aborts (`InvalidStateError`). 12/12 [ran].
4. **Safari drops a cached page's Web Lock.** The next page gets it, and the page that comes back still thinks it holds it. Chrome kept the lock in the cache. **D148's contract works on Safari too**, but for the opposite reason [ran].
5. A tab closed by WebDriver ran `pagehide`, but its committed batch never landed and never answered, 0/6. Chrome landed 6/6 on a tab close [ran].
6. Atomicity, issue order, a lost connection and reopening all match the contract. One extra: `oncomplete` events can arrive out of issue order (5 in 1,000) even though the commits on disk were in order [ran].

## 0. Website data between sessions [ran]

| | Value |
| --- | --- |
| Session 1, after a `strict` write: `estimate()` | quota 82,463,372,084, usage 55 |
| Same session, after a navigation | IndexedDB and `localStorage` both read back |
| Session 2, same origin (port fixed) | `indexedDB.databases()` `[]`, IndexedDB `null`, `localStorage` `null`, usage 0 |
| `navigator.storage.persisted()` | `false` |

**What it means.** Everything persistent has to happen inside one session. That covers reloads, navigation, bfcache, and a second tab or window of that session. Still measurable: atomicity, ordering, connection loss, bfcache, and whether a batch lands across a navigation or close. **Not measurable here:**
- Quota against a real disk.
- Real `strict`/`relaxed` cost.
- Survival across a browser restart or a kill.

These need Arpit's own profile or a device. Agents may not touch that profile. [reasoning] An ephemeral WebKit session keeps IndexedDB in memory, so the timings below come from an in-memory backend.

## 1. Atomicity and issue order [ran]

Atomicity, on one connection, with 100 keys already holding `old`:

| Batch | Answer | New values on disk |
| --- | --- | --- |
| 100 keys through `idbStorage.write` | `ok` in a later task | 100/100 |
| 100 puts with an `add` on an existing key at #50 (ConstraintError, unhandled) | `abort:ConstraintError` | 0 |
| 1,000 puts of 1 KB, then `tx.abort()` | `abort` (error `null`) | 0 |
| 100 through the adapter, value #50 a function (DataCloneError thrown by `put`) | `false`, why `"aborted"` | 0; `old` 100/100 intact |

Answer timing through the adapter: 200 batches, 0 answered inside `write`, median 0 ms, p99 1 ms.

Issue order: transaction A, then B, back to back on the same key, each with `commit()`. A is sometimes slowed with 50 × 10 KB extra keys.

| Connections | Durability A/B | Pairs | Disk shows B (last issued) | A's `oncomplete` first |
| --- | --- | --- | --- | --- |
| one | every combination of relaxed/strict, pad 0 and 50 | 8 × 100 | 800/800 | 799/800 |
| two | same | 8 × 100 | 800/800 | 800/800 |
| one | relaxed/relaxed, pad 50 | 1,000 | 1,000/1,000 | **995/1,000** |
| two | relaxed/relaxed, pad 50 | 1,000 | 1,000/1,000 | **999/1,000** |
| one, two | strict/strict, pad 50 | 1,000 each | 1,000/1,000 | 1,000/1,000 |

## 2. Quota [ran, not the real store]

The run made 50 MB `strict` writes with `commit()`, up to 2,000 MB. **It reached no failure.** All 40 chunks committed in 77–161 ms each, and a small batch afterwards still committed. `estimate()` reported quota 82,463,372,084 the whole time. Usage was reported exactly (2,000,000,964). After `deleteDatabase` succeeded, usage still read 2,000,000,991: **`estimate()` did not drop after the delete.**

So the error name, its timing against `onabort`, and real quota are **not measured**. The ephemeral store will hold at least 2 GB per origin. Going further would mean tens of GB of RAM in a WebKit process on Arpit's machine. [reasoning] The stale `usage` means a host cannot use `estimate()` to see that it got space back.

## 3. A lost connection [ran]

| Step | Result |
| --- | --- |
| Open v2 while connection `a` holds v1 | `a.versionchange` (1→2) at 4 ms, `blocked` at 4 ms |
| A batch on `a` after `versionchange`, before close | `ok`, landed |
| A batch issued, then `a.close()` at once | `ok`, landed (close waits for the batch) |
| The upgrade | `upgradeneeded` and `success` 3 ms after `close()` |
| A batch through the adapter on closed `a` | `false`, `InvalidStateError: … The database connection is closing.`, in a later task |
| A raw `a.transaction` | throws `InvalidStateError` |
| `deleteDatabase` while `b` is open, with `b` closing in its handler | `versionchange` (newVersion `null`), then `deleted` |
| Reopen after both | version 1, empty, a write succeeds |
| `onclose` (abnormal close) | never fired; nothing short of killing the storage process or clearing site data triggers it, both forbidden |

## 4. bfcache with the lock, D148 [ran]

Each arm: `/?aN` takes the lock and holds it. It then leaves by `location.href` (link-like) for `/?bN`, which probes the lock with `ifAvailable`, and comes back by `history.back()`. In every arm Safari cached the page: `pagehide persisted:true`, then `pageshow persisted:true`, even with an IndexedDB connection open. Two runs gave the same result.

| Contract | Connection open | Before leaving | B gets the lock | `query()` on B | Return | Back page's own probe |
| --- | --- | --- | --- | --- | --- | --- |
| on | yes | held | yes | none held | `reload` | free, then re-taken |
| **off** | yes | held | **yes** | **none held** | `navigate` (restored) | **free, while the page's callback still holds** |
| off | no | held | yes | none held | restored | same |
| on | no | held | yes | none held | `reload` | free |
| on, WebDriver navigate and back | yes | held | yes | — | `reload` | — |

## 5. Durability [ran, in-memory store]

200 sequential batches of 4 × 1 KB keys. Safari's `performance.now()` is coarse (1 ms), so the column to read is the mean, wall time over n.

| Durability | `tx.durability` | Mean ms | Median / p99 |
| --- | --- | --- | --- |
| relaxed | `relaxed` | 0.22 | 0 / 1 |
| relaxed + `commit()` | `relaxed` | 0.22 | 0 / 2 |
| strict | `strict` | 0.67–0.76 | 1 / 1–2 |
| strict + `commit()` | `strict` | 0.64–0.67 | 1 / 1 |
| default (both) | `default` | 0.16–0.21 | 0 / 1 |

`IDBTransaction.prototype.commit` and `durability` both exist. **Whether `commit()` matters, by how the page leaves** (20 keys of 1 KB per batch):

| How the page leaves | With `commit()` | Without `commit()` |
| --- | --- | --- |
| Batch issued, then `location.href`, same task | 6/6 + 3/3 landed | 6/6 + 3/3 landed |
| Batch issued in `pagehide`, page enters bfcache | **0/12**. Next page: empty. On return: all 20 puts fail `InvalidStateError`, then **`oncomplete` fires**. Disk still empty | **0/12**. Next page's read **hangs** (3 s bound, 12/12). On return: `abort:InvalidStateError`. Disk empty |
| Batch issued in `pagehide`, tab closed by WebDriver | 0/6 + 0/6; `pagehide` ran (beacon, `persisted:false`); no answer ever | 0/6 |

## Where Safari differs from Chrome, and what each means for the host adapter

| # | Chrome (`round-7`, `round-10`) | Safari 26.6 | For the host adapter |
| --- | --- | --- | --- |
| D1 | `oncomplete` meant landed | A `pagehide` batch into the bfcache: 0 puts land, and `oncomplete` still fires, late, on return | **Answer `true` only if every request in the batch succeeded.** Count `onsuccess` and treat any request `onerror` as `false`, so that a lie becomes a truthful `false`. Cheap and browser-neutral [reasoning] |
| D2 | Hide flush on navigate: 6/6 (with `commit()`) | 0/12. Safari freezes the page before the store runs the batch | On Safari, the hide flush does not save state when the page enters the bfcache. What is on disk is the last capture, so D80's 5 s coalescing is the real loss window there. A host might flush on `visibilitychange: hidden` where that fires, and must not count on `pagehide` [reasoning] |
| D3 | Autocommit lost the batch (0/12) | Without `commit()`, the frozen batch **holds the store**, and the next page, which owns the lock, hangs on boot `load` | **`commit()` on every transaction the host makes, not just edge batches,** including `strictMarker` and `load`. Better still, issue no transaction from `pagehide persisted` at all. Bound boot's `load` with a timeout that reports it [reasoning] |
| D4 | The cached page kept its Web Lock, so the next page was a second tab | Safari releases it; the page that comes back keeps a pending callback but holds nothing | **D148 holds on both** (release on `pagehide persisted`, reload on `pageshow persisted`). On Safari the reload is what is load-bearing: without it, a restored page believes it owns what it does not own, and two writers run. Never infer "I hold the lock" from a pending callback [ran + reasoning] |
| D5 | Tab close: 6/6 landed | 0/6, no answer | Same as D2: the hide flush is unreliable on close. "No answer, ever" is allowed by the contract, so the edge stays safe; the loss window is the capture interval [reasoning] |
| D6 | Answer order not measured | `oncomplete` order can invert, 5 in 1,000 on one connection, relaxed. Disk order still matches issue order | The edge already keeps one batch out per actor and assumes no order between batches, so this is fine. **Never infer commit order from answer order** across actors [ran + reasoning] |
| D7 | Adapter's `why` is the error name | A `DataCloneError` from `put` leaves `why: "aborted"`, because the adapter's `tx.abort()` sets `error` to null | Keep the caught exception's name for the answer. Diagnostic only [ran] |
| D8 | `estimate()` moved by CDP override, not by real usage | Exact usage, but stale after `deleteDatabase`; 82 GB quota reported for an ephemeral session | Do not use `estimate()` to see that space came back, or to predict a quota failure [ran] |
| D9 | strict 0.5 vs relaxed 0.3 ms at 1,000 (disk, round 6) | strict ≈ 3× relaxed, even in memory; `default` behaves like relaxed | The existing split (ack strict, plain relaxed) stays. Real cost is unmeasured [ran, in memory] |

Same as Chrome: multi-key atomicity under request error, abort and a throw. Commit in issue order on one connection and across two. Answers in a later task. `versionchange` and `blocked`. `InvalidStateError` on a closed connection. Reopening [ran].

## Not run

- Real quota and its error, and quota timing against `onabort`.
- Real disk durability, and survival across a quit or a kill.
- `onclose` on an abnormal close.
- A batch issued in `pagehide` on a page Safari does not cache.
- Tabs closed by the user rather than WebDriver.
- iOS.

The first two need a persistent profile, which item 0 rules out under WebDriver. `vp check` on `safari/` formats clean. It reports 53 type-strictness errors (`any` casts, the same style as `round-10/reality/`), which were left as they are.
