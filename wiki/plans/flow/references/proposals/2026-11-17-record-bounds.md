---
proposal record-bounds
status superseded 2026-11-17 [@proposal.record-bounds-revised]
    proposed 2026-11-17
---
# Record size bounds: one rule

**Rule:** no send ever waits on a record that may not encode. Lane and owed records encode by construction;
only an actor record can fail, and then its plain writes wait while every ticket that would wait with them is
refused at once.

Written by the building lead of @task.V3.T20 (the convergence pass). Prior art: the WIP at `98b4f8b9`.

## The class

The core judged a record's bound once, at one moment, and assumed it would still encode at every later write,
and that a record which did not encode could simply wait. Both are false: a record keeps changing after the check
(a head goes Held, a retryCount gains a digit, a displaced id appears, rows are owed, memory grows), and whatever
awaits a waiting record (a send's acknowledgement, another lane's commit, the actor's end) waits for ever.

Findings this explains, from @task.V3.T20's reviews (14:47, 15:18) and the tests-first step (19:06):

| Trace                                                                | Assumed at            | Grew by                     |
| -------------------------------------------------------------------- | --------------------- | --------------------------- |
| 12 serialize Syncs of 200,000 chars withhold the identity            | the input alone       | queued inputs               |
| a record at the bound withholds when its head goes Held              | commit time           | `inFlight` false            |
| a retry's tenth digit, a cancel's displaced id                       | commit time           | `retryCount`, `displaced`   |
| a 2.25 MB value beside a 9-byte one: both saved null                 | each value alone at 0 | the packing                 |
| past 1,249 rows the node bound fails and withholds                   | one owed record       | rows                        |
| a receipt saved null refuses its turn at each start                  | the saved value       | a `null` the Schema refuses |
| transfers seed 7: a receipt in memory withholds the account for good | the actor record      | memory; the ticket waits    |

## Requirements, together

- Codec R1 bounds; R4 a turn never fails on a value it cannot save, UnencodableValue reports it, and a commit that
  would take its lane's record past a bound declines NotSent { Unencodable }; R5 three record kinds.
- WriteAhead R4: an actor record past a bound skips its capture and the last good capture stays. R12: StorageSilent
  only for a batch issued. I11: no lane record outruns its actor record. I21: every touched record is in its step's
  write list.
- Actors R8: the end waits while the actor record cannot encode.
- Restore R1, R3: Owing identities wake at the boot; every acknowledged Attempt without a saved ending is heard
  unknown { Restored }.
- No lost, doubled or made-up ending; no hang.

These conflict only at one point: I11 forbids a lane record landing without its actor record, and "no hang" forbids
waiting for that actor record. The rule resolves it by refusing, not waiting.

## Design

1. **Lane records fit at their largest.** A persisted commit is admitted only if its lane's record encodes at the
   largest it can reach without another admission: every input it holds with this one queued, the head Held, the
   longest `retryCount` and Attempt id, and one more displaced Attempt. Every later change only drops inputs or
   fills those slots; each new input or displaced id comes from an admission, which checks again. Otherwise
   NotSent { Unencodable } (Codec R4's existing text). So a lane record never fails to encode.
2. **Owed rows are saved in measured parts.** Each row is measured once per write; rows fill `owed/<identity>`
   and, past a bound, further parts `owed/<identity>|0001`, in owed order. A row whose value has no form even in a
   part of its own is saved as the ending it would restore as had it never been saved: unknown { Restored } with
   its Attempt. So an owed record never fails to encode, and nothing restored fails its machine's Schema.
3. **An actor record that cannot encode refuses, never withholds a ticket.** Its plain writes (actor, lane, owed
   records) wait as one, reported UnencodableValue once (WriteAhead R4, I21's exception; the last good capture
   stays). A ticket a send awaits from it is refused at once by the core's step, as a store refusal is: a first
   send ends NotSent { StorageRefused }, a re-send returns Held with unknown { StorageRefused } (WriteAhead R13).
   No StorageSilent is armed for it. Actors R8's end still waits, which is an actor kept alive, not an ending lost.
4. **Displaced Attempts on the wire are in their lane's record** (WriteAhead I17), whether or not a cancel is
   pending on them, so a reload ends each unknown { Restored }; one not owed to the identity is evidence, as live.

## Added and dropped

- Added: refused-at-once tickets (3); unknown { Restored } as the saved form of an unsavable value (2); displaced
  on-wire Attempts in the lane record (4).
- Dropped: withholding a ticket; the `withheld` tickets list; "largest values null, largest first" (Codec R4);
  `null` as a saved value of a success or failure row.
- Kept from the WIP: the largest-form admission (1) and owed parts (2).

## Public outcomes changed (for the user, as two traces of one Story)

`transfers/stress-45` style, an account whose memory holds a receipt past a string's bound, then a transfer:

- before: UnencodableValue withheld; the transfer's lane stays Acknowledging; no ending, ever.
- after: UnencodableValue; the transfer ends NotSent { StorageRefused }; the account goes on.

`transfers/stress-large-receipts`, a receipt of 262,145 chars owed to a closed account, then a reload:

- before: saved `null`; at each start the success's mapping refuses the turn InvalidTurn; never heard.
- after: saved unknown { Restored }; heard once as unknown { Restored }, as a crash before it was saved would be.

## Reverse

Each part reverts alone: (1) drop `fits`; (2) restore single-record `encodeOwed`; (3) restore the withheld
tickets; (4) drop on-wire entries from `displaced`.
