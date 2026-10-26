# Evidence for the entity domain design

The two gates [entity-domain.md](../design/entity-domain.md) section 15 records, kept so stage S5
can port them. Neither is product code; both run against the repository's own toolchain.

## type-spike

The draft 8 type spike: a self-contained model of the domain vocabulary's types (`lib.ts`), an
application using it (`app.ts`, `types.ts`, `run.ts`), seven application sketches (`exp/`, with
reference answers in `exp-ref/`) and negative fixtures (`neg/`), each expected to fail to compile
for the reason its name gives.

Run from this directory, after linking the repository's packages:

```bash
ln -s ../../../../../../node_modules node_modules
```

```bash
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
```

```bash
node node_modules/typescript/bin/tsc -p tsconfig.neg.json
```

The first exits 0. The second must report errors in every `neg/` file (33 errors on
2026-10-26). Remove the link afterwards; it is not committed.

## runtime-model

An executable model of entity-domain.md section 5, fuzzed against a fake server: one versioned
entity, a filtered and ordered list, a derived count and a loader. `model.mjs` is the model;
each `mut-*.mjs` is the model with one rule removed.

```bash
node runtime-model/model.mjs 20000
```

passes every run (40,000 runs: each seed with and without omitted fields). A mutant run
(`node runtime-model/mut-no-tombstone-guard.mjs 3000`) should fail; section 15.3 lists which
mutants the fuzz catches and the four it does not, which stage S5 must cover with targeted tests.
