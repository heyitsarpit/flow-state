# Round 11: status at the checkpoint (minute 35)

Proposed, all of it. Decisions in `../convergence-11.md` (D194-D206 so far). For the mid-session review; the builder keeps going.

## Where it stands

- **Codec measured, chosen: in-process (D194).** Typed module imported, `machine()` is the compile, Slots are the closures; no runtime codec for `Compiled`. `toData` (`codec/codec.ts`) is the tools' view, with `CompiledData` (Effect Schema) as the contract. Numbers: `codec/measure.txt`, `codec/measure-cold.txt`, `codec/browser.txt` [ran].
  - Pay warm: in-process 0.027 ms; data parse + rebind 0.037 ms (and still needs the in-process table); Schema contract 0.12 ms; Schema codec 0.155 ms. 50 machines: 0.93 / 1.91 / 4.66 ms.
  - Cold, fresh process: hand 1.05, in-process 2.00, data 3.11, generated module 3.38 ms.
  - Bundle gzip: hand Pay 3.1 KB; in-process 7.1 KB (front end 2.9 KB of it); data adds 1.9 KB; module adds 2.4 KB.
  - Persisted records, Chrome 146 headless, 10,000 messages: `structuredClone` of the object 3.3 ms vs `JSON.stringify` 0.7 ms (4.7x, the Bun guess confirmed); IndexedDB put to complete: string 2.4 ms, object 3.1 ms (6x CPU: 11.4 vs 16.2); get: equal. Records stay a JSON string. Safari not run.
- **Front end grown** (`conformance/typed/flow.ts`, moved out of the round: D205): fragment operations, guard ports, `whenAbandoned`, `.each`, `resetOn`, keyed raises, `disarmOn`, unknown by reason, `local`, `uses`, `places` on a machine, computed and absent memory fields, key-less `idle`. A bug found by the port: a bare state token compiled as a history target.
- **Typed fixtures so far** (`conformance/typed/`): Pay, round7 (Bare, FragPair), round8 (serial Bare, business key, Doors, Copies, Loop), round9 (Bulk, Kept), round9b (Chain, Edge). Scenarios switched by import path only (D195).
- **Suite on round 11: 742/742, whole output unchanged** for every case these machines boot [ran]. Case hashes moved only where a scenario was edited: fault paths `operations.X.NotSent` to `operations.X.failure.NotSent` (D206), and 7 variants that need a key no field list makes keep the hand machine (finding F2).
- Census: 183/742 cases booted only typed output before Pay switched; Pay adds about 80. Rerun pending.

## Not done yet

Notes, Form, Feed, Deep, Panels, Addr, Ticket, TraitWrite and the other desk/lab machines; pay-full (swaps.ts names `typed/pay-full.ts`, not yet written, so `--swap` cannot run at this checkpoint); entity and stream machines (Issues, Chat, Desk, Feed, Cart, Refunds); the `Compiled` change; log lines for the lock; every gate but the plain suite.
