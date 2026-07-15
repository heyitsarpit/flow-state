# Offline recovery

This example keeps cached movies and a durable outbox in Flow resources. The parent machine owns
host connectivity, the online observation, and a child worker; the worker reads the outbox and
starts a fresh transaction for each restored item. Runtime boot data persists the outbox, never an
interrupted external effect.

`pnpm --filter @flow-state/offline-recovery test` runs the deterministic runtime, rehydration,
stream, transaction, trace, scenario, and React proofs. `pnpm --filter
@flow-state/offline-recovery build` also builds Next and runs packed CLI trace comparison and a
focused actor proof.
