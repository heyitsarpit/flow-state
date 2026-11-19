# Core shapes: what an app author notices (T102, 2026-11-19)

**Bottom line:** almost nothing changes in app code; the core is safer inside. Every closed set the runtime branches on
is a declared type with exhaustive handling, so a misspelt code or a new case fails to compile instead of silently
falling through.

- A write's unknown ending whose reason you name `Restored` no longer counts as saved: Flow's own restored marker is
  now separate from your reason text.
- Runtime ids (incarnations, attempts, chains, activations) come from one mint and are never parsed back from text.
- When several actors are handled together (consumers of one context update, a provider's dependents), they go in
  the order they started; T105 states this as a rule.
- The bench worker refuses a malformed flag instead of looping or reading it as a value.

Two lint rules keep the old shapes out: `no-tag-chain` and `no-id-text`.
