# Packet receipts

[Back to the plan tracker](../../TASK.md)

Completed packets:

- [P0.1a](./P0.1a.md) — retained with its historical two-commit closeout proof.

Create one immutable file per completed packet using [the packet and receipt contract](../templates/PACKET.md). This index may be generated later, but a generated index never substitutes for a packet receipt.

New receipts record the exact Base commit and
`Commit proof: derived-from-git-history`. The reviewed packet artifacts, receipt,
and matching `TASK.md` transition are committed together once; Git history
provides that commit's exact SHA. A receipt cannot embed the SHA of the commit
containing itself without creating a self-reference.
