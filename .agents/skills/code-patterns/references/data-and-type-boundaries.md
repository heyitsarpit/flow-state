# Data and type boundaries

Read this when a change admits data, preserves generic relationships, or models variants and invariants.

## Data boundary

- `Data` provides immutable value types when the domain uses it; it does not
  replace every public shape or ownership boundary.
- Private builders may use mutable objects, arrays, Maps, and Sets when their
  mutators stay behind the owner and do not escape into asynchronous work.
- Use `readonly`, `Readonly`, readonly collection views, or custom readonly
  types when a public contract requires a non-mutating shape or when they
  preserve a real type relationship. Do not treat a project-local
  `no-readonly` check as permission to reject those contract-required shapes.
- Capture or freeze once at an observable boundary only when the contract
  requires an immutable snapshot, accepted argument, canonical key, or
  checkpoint. Freezing a Map or Set does not disable its mutators, and freezing
  private data is not an ownership design.
- Use `Result` for success and failure.
- Use `Option` for presence and absence.
- Prefer `Data.TaggedEnum` for three or more domain variants.

## CP-08 — Preserve type relationships

- **Bad:** `any`, `as unknown as`, broad definition/`unknown` storage erasing known types, or casting an untyped registry result to a caller-chosen generic.
- **Good:** Carry definition, event, state, descriptor/key, and Effect A/E/R relationships through the owner. Use nominal witnesses for lookup; use closures and narrow existential capabilities when heterogeneous storage must hide a type.
- **Data utilities:** Use `Data.TaggedEnum.Value` to select a full variant. Use `Data.TaggedEnum.Args` to select its constructor fields. Use `WithGenerics` and `Kind` for generic unions. Use `Constructor` for an exported constructor bundle.
- **Keep:** `unknown` at external-input admission. Infer ordinary implementation returns; annotate genuine public, recursive, or inference boundaries. A "trusted registry" label does not prove a cast sound.

```ts
// Bad: the chosen D is supplied by the caller's assertion.
const actor = actors.get(key) as ActorInstance<D>;

// Good shape: the admitted nominal witness controls lookup.
const actor = directory.lookup(machineWitness, stableRef);
```

```ts
// Before: repeat the extraction rules at every call site.
type Done = Extract<Attempt, { _tag: "Done" }>;
type DoneFields = Omit<Done, "_tag">;
```

```ts
// After: derive both types from the tagged enum.
type Done = Data.TaggedEnum.Value<Attempt, "Done">;
type DoneFields = Data.TaggedEnum.Args<Attempt, "Done">;
```

## CP-09 — Admit once, then transform trusted values

- **Bad:** Repeating reflection, Schema decoding, membership scans, and copies
  inside a trusted transaction; assuming fresh external input is safe merely
  because its type is readonly.
- **Good:** `unknown → owner-level Result/Schema admission → owned typed value → plain transforms or Effects`. Capture hostile accessors/proxies, diagnostic precedence, and required stability rereads at that boundary. Preserve opaque identity and reuse private membership indexes afterward.
- **Data boundary:** `Data.taggedEnum` constructs trusted plain data. `$is` checks only `_tag`. It is not Schema admission. Decode unknown input first.
- **Keep:** Capture App-owned machine facts at App construction, preserving allowed mutations before construction. Each phase consumes the previous admitted value; new external mailbox, store, or key data still needs admission.

```ts
// Before: a Data tag check is treated as full validation.
if (Status.$is("Done")(unknownInput)) return unknownInput.exit;
```

```ts
// After: admit first, then match the trusted value.
const admitted = Schema.decodeUnknownResult(StatusSchema)(unknownInput);
const result = Result.map(
  admitted,
  Status.$match({
    Idle: () => undefined,
    Done: ({ exit }) => exit,
  }),
);
```

## CP-14 — Express variants and invariants directly

- **Bad:** Conditional empty-object/array spreads, nested workflow ternaries, numbered-phase or syntax-narrating comments, and vague names when the domain concept is known.
- **Good:** Return complete `Data.TaggedEnum` variants. Use `Data.taggedEnum` constructors and `$match` when they make the choice clear. Use named functions or explicit branches for larger or effectful choices. Name the operation, such as capture, publication, lineage merge, or cleanup.
- **Keep:** Comments explaining ordering, ownership, cursor invariants, or sound narrowing. Do not extract a single expression merely to shorten a function.

```ts
// Before: the record's shape is implicit in construction tricks.
const outcome = committed
  ? { ...base, revision }
  : { ...base, pending: true };
```

```ts
// After: four domain variants explain which fields belong together.
type Publication = Data.TaggedEnum<{
  Prepared: { snapshot: Snapshot }
  Published: { snapshot: Snapshot; revision: number }
  Superseded: { snapshot: Snapshot; replacement: Snapshot }
  Rejected: { snapshot: Snapshot; cause: FailureCause }
}>;

const Publication = Data.taggedEnum<Publication>();
const outcome = Publication.Published({ snapshot, revision });
const describe = Publication.$match({
  Prepared: () => "prepared",
  Published: ({ revision }) => `published at ${revision}`,
  Superseded: ({ replacement }) => `superseded by ${replacement}`,
  Rejected: ({ cause }) => `rejected: ${cause}`,
})(outcome);
```

### R-07 — Preserve adapter generic relationships

- **Bad:** Storing an adapter as `unknown`, recovering it with a cast, or replacing the
  declaration-specific input/output relationship with `(...args: never[]) => void`.
- **Good:** Keep a typed capability that pairs each declaration with its descriptor,
  input, invocation, and result from construction onward. Use an owner-specific
  existential representation when heterogeneous storage must hide the concrete
  declaration; do not restore the relationship with a caller-selected cast.
- **Review proof:** Exercise multiple declaration types and verify that each adapter
  accepts and returns only the type belonging to its own declaration.

```ts
// Bad: the adapter relationship is erased and recovered with a cast.
type StoredOperationAdapter = (...args: unknown[]) => unknown;

const attachOperationAdapter = (
  descriptor: OperationDeclaration,
  adapter: unknown,
) => {
  Object.defineProperty(descriptor, adapterTypeId, { value: adapter });
};

return (descriptor as InternalOperationDescriptor)[adapterTypeId];

// Good: keep the declaration-specific capability intact.
type OperationCapability<Descriptor extends OperationDeclaration> = {
  descriptor: Descriptor;
  invoke: (input: OperationInput<Descriptor>) => OperationResult<Descriptor>;
};

const publishOperation = <Descriptor extends OperationDeclaration>(
  capability: OperationCapability<Descriptor>,
) => capability;
```

### R-08 — Preserve generic identity through construction

- **Bad:** Using `WeakMap<object, unknown>` and casting its result to a caller-selected
  generic such as `AppPlan<Modules>`. The key does not carry proof of that relationship.
- **Good:** Return a typed capability from construction, with the module relationship
  captured by that instance. If heterogeneous storage erases the relationship, its
  lookup must not promise a caller-selected generic. A nominal weak collection may
  prove admission, but it must not forward mutable state or restore erased generic
  identity.
- **Review proof:** Check cross-typed app/module lookups, construction boundaries, and
  older snapshots; no caller assertion may choose the recovered generic.

```ts
// Bad: the key carries no proof for the caller-selected generic.
const plans = new WeakMap<object, unknown>();

const readPlan = <Modules extends AnyModule>(app: App<Modules>) =>
  plans.get(app) as AppPlan<Modules>;

// Good: retain the relationship in the instance created for this module set.
type AppCapability<Modules extends AnyModule> = {
  readPlan: () => AppPlan<Modules>;
};

function makeApp<Modules extends AnyModule>(
  plan: AppPlan<Modules>,
): App<Modules> & AppCapability<Modules> {
  return Object.assign(createApp(plan), {
    readPlan: () => plan,
  });
}
```

### R-09 — Avoid casts after `Object.entries` and `Object.values`

- **Bad:** Casting reflected values directly to a declaration-specific array, such as
  `Object.values(definition.E) as Timer<DefinitionValue>["target"][]`. Do not use
  `Object.values(definition) as const`; a const assertion cannot make an arbitrary
  reflected expression declaration-specific.
- **Good:** Let the owning compiler helper preserve the declaration relationship and
  return the typed collection from the source definition. A narrow, justified
  owner-specific narrowing after reflection may remain valid; it is not a license
  for a caller-selected generic cast.
- **Review proof:** Cover heterogeneous definitions and ensure the helper cannot
  associate an event or target with a different machine definition.

### R-10 — Preserve provider `A/E/R` channels

- **Bad:** Erasing provider acquire effects to `Effect<unknown, unknown, unknown>`,
  restoring their relationships with unchecked casts, or changing a contract's
  declared duplicate-configuration behavior merely to fit a generic failure rule.
- **Good:** Preserve the provider service key and exact acquire `A/E/R` channels
  through admission. Implement duplicate-service behavior exactly as the owning
  contract declares: it may intentionally throw synchronously for duplicate
  configuration, or it may use `Result` or a typed failure channel. Keep the
  existential provider representation explicit and owner-specific.
- **Review proof:** Check duplicate providers, heterogeneous services, typed failures,
  defects, and interruption against the contract. Do not universalize either raw
  throws or typed `Result` failure behavior.
