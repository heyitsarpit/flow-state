# Record size bounds: one rule, revised (proposed)

**Rule:** no send ever waits on a record that may not encode. Lane and owed records encode by construction;
when an actor record cannot, its plain writes wait and every ticket that would wait with them is refused at once.

Status: proposed, the building lead of @task.V3.T20. Revises code:wiki/plans/flow/references/proposals/record-bounds-2026-11-17.md
(the class, findings and requirements are there) after one adversarial Haiku review; that file stays as prior art.

## Design

1. **Lane records fit at their largest.** A persisted commit is admitted only if, with it admitted, its lane's
   record encodes at the largest it can reach without another admission (every input queued, the head Held, the
   longest `retryCount`, the longer of the head's Attempt id and this boot's longest, one more displaced Attempt),
   and an owed row naming the lane encodes. Otherwise NotSent { Unencodable } (Codec R4). Every later change only
   drops inputs or fills those slots.
2. **Owed rows are saved in measured parts.** Rows fill `owed/<identity>` and, past a bound, `owed/<identity>|0001`
   on, in owed order, each row measured once per write. A Flow-made row with no value saves `null` and reads back
   with none. A row whose value has no form even alone is saved as unknown { Restored } for its Attempt, reported
   UnencodableValue: after a reload it is heard as a crash before its save would have made it. Only a stopped
   read's Interrupted is a read's row, and it is Flow-made and small.
3. **An actor record that cannot encode refuses its new tickets.** The identity's plain writes wait as one,
   reported UnencodableValue once; the last good capture stays (WriteAhead R4, I21's exception). Each ticket its
   step minted is not issued: the step's Persist names it refused, and the host answers it refused as its next
   input, so the send takes WriteAhead R13's path (a first send NotSent { StorageRefused }, a re-send Held with
   unknown { StorageRefused }), with UnencodableValue as its evidence. A ticket already issued is never refused
   (R12: it waits for its batch). No StorageSilent is armed for a refused ticket.

## Review log (one adversarial Haiku, effort high)

- Accepted: the lane id inside an owed row passes the string bound (`$.rows[0].lane`, a repository of 262,144
  chars; reproduced by the lanes stress seeds), so (1) checks that row; Attempt ids from an older boot can be
  longer, so (1) takes the longer; a Flow-made unknown row's `undefined` value counted as unsavable and reported on
  every write, so (2) saves it `null`; the refusal must go through the host, not inline, or a commit promoted by
  it waits for the next input (3).
- Changed: unknown { Restored } contradicts WriteAhead R14 ("saved endings are delivered, not replaced by
  unknown"): kept, as R14 assumes a value that can be saved, and the only alternative heard today is a refused turn
  at every start; R14 and Codec R4 get the case, and it goes to the user as a public outcome.
- Rejected: refusing an issued ticket (3 refuses only tickets its own step minted); the end never writes its record
  (the record is projected at the turn's step; the end only makes the write due now).
- Routed, not this class: displaced on-wire Attempts in no record (WriteAhead I17, a missing field, not a size;
  restoring them needs an owed flag so an evidence-only one is not made a delivered ending; its `it.fails` stays);
  a Held head re-owed unknown { Restored } at every start (Restore R3 "once"); WriteAhead R11's scope bound counting
  owed parts.

## Spec edits

Codec R4 (the largest form; unknown { Restored } replaces "largest values null"), Codec R5 and I7 (owed part keys),
WriteAhead R13 (refusal by encoding), R14 (the unsavable value), the realization (no withheld ticket).

## Public outcomes changed (for the user, as two traces of one Story)

An account whose memory holds a receipt past a string's bound, then a transfer:

- before: UnencodableValue; the transfer's lane stays Acknowledging; no ending, ever.
- after: UnencodableValue; the transfer ends NotSent { StorageRefused }; the account goes on.

`transfers/stress-large-receipts`: a receipt of 262,145 chars owed to a closed account, then a reload:

- before: saved `null`; at each start the success's mapping refuses the turn InvalidTurn; never heard.
- after: saved unknown { Restored }; heard once as unknown { Restored }.
