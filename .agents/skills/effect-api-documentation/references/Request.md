# `Request`

Source: [Effect v4 `Request` API](https://www.effect.website/docs/v4/api/effect/Request). Examples assume `import { Effect, Request } from "effect"`.

## API index

1. [Request.tagged](#requesttagged)
2. [Request.TaggedClass](#requesttaggedclass)
3. [Request.completeEffect](#requestcompleteeffect)
4. [Request.succeed](#requestsucceed)
5. [Request.fail](#requestfail)
6. [Request.of](#requestof)
7. [Request.isRequest](#requestisrequest)

### Additional known APIs (not expanded)

`Request`, `Any`, `Error`, `Success`, `Services`, `Result`, `Constructor`, `Class`, `complete`, `failCause`, `makeEntry`, `Entry`

### [Request.tagged](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:327)

Creates a typed request constructor that adds a stable `_tag`, making mixed request unions easy to dispatch in a resolver.

```ts
interface GetUser extends Request.Request<string, Error> {
  readonly _tag: "GetUser";
  readonly id: string;
}
const GetUser = Request.tagged<GetUser>("GetUser");
const request = GetUser({ id: "user-1" });
```

### [Request.TaggedClass](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:401)

Defines a class-based request with a fixed tag and typed fields for domain models that benefit from constructors and tagged unions.

```ts
class GetUserById extends Request.TaggedClass("GetUserById")<
  { readonly id: string },
  string,
  Error
> {}
const request = new GetUserById({ id: "user-1" });
```

### [Request.completeEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:462)

Completes a resolver entry from an effect, translating its success or typed failure into the request result.

```ts
interface GetUser extends Request.Request<string, Error> {
  readonly id: string;
}
declare const entry: Request.Entry<Request.Request<string, Error>>;
const completeUser = Request.completeEffect(entry, Effect.succeed("Ada"));
```

### [Request.succeed](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:539)

Completes a pending request entry with its successful value.

```ts
declare const entry: Request.Entry<Request.Request<string, Error>>;
const completeUser = Request.succeed(entry, "Ada");
```

### [Request.fail](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:490)

Completes a pending request entry with its typed request error.

```ts
declare const entry: Request.Entry<Request.Request<string, Error>>;
const failUser = Request.fail(entry, new Error("user not found"));
```

### [Request.of](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:282)

Creates a constructor for an untagged request type when the request shape itself is the useful identity.

```ts
interface GetSettings extends Request.Request<Readonly<Record<string, string>>, Error> {
  readonly accountId: string;
}
const GetSettings = Request.of<GetSettings>();
const request = GetSettings({ accountId: "acct-1" });
```

### [Request.isRequest](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Request.ts:251)

Checks and narrows unknown input before passing it to request-aware infrastructure.

```ts
declare const candidate: unknown;
if (Request.isRequest(candidate)) {
  const request = candidate;
}
```
