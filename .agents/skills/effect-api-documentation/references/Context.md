# `Context`

Source: [Effect v4 `Context` API](https://www.effect.website/docs/v4/api/effect/Context). Examples assume `import { Context } from "effect"`.

## API index

1. [Context.Service](#contextservice)
2. [Context.Key](#contextkey)
3. [Context.Service.Shape](#contextserviceshape)
4. [Context.Service.Identifier](#contextserviceidentifier)
5. [Context.Reference](#contextreference)
6. [Context.make](#contextmake)
7. [Context.add](#contextadd)
8. [Context.get](#contextget)
9. [Context.getOption](#contextgetoption)
10. [Context.getOrElse](#contextgetorelse)
11. [Context.merge](#contextmerge)
12. [Context.mergeAll](#contextmergeall)
13. [Context.pick](#contextpick)
14. [Context.omit](#contextomit)

### Additional known APIs (not expanded)

`ServiceTypeId`, `Key`, `ServiceClass`, `Reference`, `makeUnsafe`, `isContext`, `isKey`, `isReference`, `empty`, `addOrOmit`, `getOrUndefined`, `getUnsafe`, `getReferenceUnsafe`, `mutate`

### [Context.Service](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:200)

Creates a typed service key used to read and provide a dependency through `Context`.

```ts
const Database = Context.Service<{ query: (sql: string) => string }>("Database");
```

### [Context.Key](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:65)

`Context.Key<Identifier, Shape>` is the typed service-key contract: `Identifier` is the requirement recorded in an `Effect`, and `Shape` is the value retrieved from the context.

```ts
class Database extends Context.Service<Database, { readonly query: (sql: string) => string }>()("Database") {}
type DatabaseKey = Context.Key<Database, Context.Service.Shape<typeof Database>>;
const key: DatabaseKey = Database;
```

### [Context.Service.Shape](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:399)

Extracts the service implementation type behind a service key. The [service requirements recipe](/Users/arpit/Developer/flow-state/codebases/effect-website/apps/web/src/content/docs/v4/requirements-management/services.mdx) uses this utility for class-style services.

```ts
class Database extends Context.Service<Database, { readonly query: (sql: string) => string }>()("Database") {}
type DatabaseShape = Context.Service.Shape<typeof Database>; // { readonly query: (sql: string) => string }
```

### [Context.Service.Identifier](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:422)

Extracts the requirement type associated with a service key.

```ts
class Database extends Context.Service<Database, { readonly query: (sql: string) => string }>()("Database") {}
type DatabaseIdentifier = Context.Service.Identifier<typeof Database>; // Database
```

### [Context.Reference](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1335)

Creates a service key with a lazily computed, cached default value. A missing reference can therefore be resolved without an explicit context entry.

```ts
const Logger = Context.Reference("Logger", {
  defaultValue: () => ({ log: (message: string) => console.log(message) }),
});
const logger = Context.get(Context.empty(), Logger);
```

### [Context.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:643)

Creates a context containing one service implementation.

```ts
const Logger = Context.Service<{ log: (message: string) => void }>("Logger");
const services = Context.make(Logger, { log: console.log });
```

### [Context.add](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:685)

Adds or replaces one service in an existing context.

```ts
const Port = Context.Service<number>("Port");
const services = Context.empty().pipe(Context.add(Port, 8080));
```

### [Context.get](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:927)

Reads a service whose presence is represented by the context type.

```ts
const Port = Context.Service<number>("Port");
const services = Context.make(Port, 8080);
const port = Context.get(services, Port);
```

### [Context.getOption](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1047)

Reads a service as `Option`, returning `None` when a non-reference key is absent.

```ts
const Port = Context.Service<number>("Port");
const port = Context.getOption(Context.empty(), Port);
```

### [Context.getOrElse](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:809)

Reads a service or lazily supplies a fallback when it is absent.

```ts
const Port = Context.Service<number>("Port");
const port = Context.getOrElse(Context.empty(), Port, () => 8080);
```

### [Context.merge](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1092)

Combines two contexts; services in the right-hand context win on duplicate keys.

```ts
const Host = Context.Service<string>("Host");
const Port = Context.Service<number>("Port");
const services = Context.merge(Context.make(Host, "localhost"), Context.make(Port, 8080));
```

### [Context.mergeAll](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1145)

Combines any number of contexts, keeping the last value for duplicate keys.

```ts
const services = Context.mergeAll(
  Context.make(Context.Service<string>("Host"), "localhost"),
  Context.make(Context.Service<number>("Port"), 8080),
);
```

### [Context.pick](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1192)

Keeps only an allowlisted set of services.

```ts
const services = Context.make(Context.Service<string>("Host"), "localhost");
const publicServices = services.pipe(Context.pick(Context.Service<string>("Host")));
```

### [Context.omit](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Context.ts:1239)

Removes selected services from a context before passing it across a boundary.

```ts
const Secret = Context.Service<string>("Secret");
const services = Context.make(Secret, "redacted");
const safeServices = services.pipe(Context.omit(Secret));
```
