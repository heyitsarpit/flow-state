# Packet receipts

[Back to the plan tracker](../../TASK.md)

No implementation packet has completed under this plan yet.

Create one immutable file per completed packet using [the packet and receipt contract](../templates/PACKET.md). This index may be generated later, but a generated index never substitutes for a packet receipt.

Each receipt is created only after the reviewed Packet commit exists and names
that commit's exact SHA. A metadata-only Closeout commit then introduces the
receipt and the matching `TASK.md` done/top-status transition; the receipt does
not embed the Closeout commit SHA. Its fixed `Closeout proof` value is
`derived-from-git-history`, meaning Git proves that the commit introducing the
receipt is the direct child of Packet and atomically introduces the matching
status transition.

Packet must be the direct child of Base, and Closeout must be the direct child
of Packet. Neither commit may be amended. Before Closeout exists, repair/retry
only its metadata; a malformed committed Closeout stops for explicit recovery
because a third commit is forbidden.
