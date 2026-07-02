# Patterns

This page only covers the sharp rules that are easy to violate in real apps.

For the ownership model, use [Concepts](/concepts). For project layout and build
order, use [App Structure](/guide/app-structure).

## Keep These Boundaries Clean

- Put canonical shared data in resources.
- Put process-owned local state in machines.
- Put visible writes in transactions.
- Put cross-source projection in views only when direct reads become awkward.
- Put side effects behind Effect services and Layers.

If one value seems like it belongs everywhere, that is usually a sign the owner
is still unclear.

## Prefer These Defaults

- Prefer `useResource(...)` before `useView(...)`.
- Prefer `submit` or `flow.run(...)` over calling services from reducers.
- Prefer `test(machine).with(...).run()` before `test.app(App).scenario(machine)`
  when shared data is not part of the behavior.
- Prefer `flow.after` for one-shot timers and Effect `Schedule` for recurring
  time behavior.
- Prefer runtime facts such as receipts, issues, streams, and timers over sleeps
  or test retries.

## Watch For These Smells

- Canonical API data copied into machine context.
- React components hiding fetches or writes.
- Views added for simple one-resource or one-actor rendering.
- `actions` doing async work.
- Receipts treated as product state instead of diagnostics.
- App code depending on broad XState-style semantics that Flow State does not
  currently prove.

## A Good Feature Slice

In practice, the safest order is still:

1. service contract
2. resource
3. transaction if needed
4. machine
5. optional view
6. React shell
7. scenario tests

That path is not dogma. It is just the shortest route to keeping ownership
clear.
