# Unstable `Rpc`

Import from `effect/unstable/rpc`. This API is unstable; the pinned local
`effect@4.0.0-beta.86` source is authoritative. See the [official Effect v4
Rpc API](https://www.effect.website/docs/v4/api/effect/unstable/rpc/Rpc).

## API index

1. [Rpc.make](#rpcmake)
2. [Rpc.setPayload](#rpcsetpayload)
3. [Rpc.setSuccess](#rpcsetsuccess)
4. [Rpc.setError](#rpcseterror)
5. [Rpc.middleware](#rpcmiddleware)
6. [Rpc.custom](#rpccustom)
7. [Rpc.exitSchema](#rpcexitschema)
8. [Rpc.prefix](#rpcprefix)
9. [Rpc.fork](#rpcfork)
10. [Rpc.uninterruptible](#rpcuninterruptible)
11. [Rpc.isRpc](#rpcisrpc)

### Additional known APIs (not expanded)

`Rpc`, `Any`, `AnyWithProps`, `DefectSchema`, `Handler`, `ServerClient`, `Custom`, `Custom.Out`, `Custom.OutDefault`, `Custom.Kind`, `Tag`, `PayloadSchema`, `PayloadConstructor`, `Payload`, `SuccessSchema`, `Success`, `SuccessEncoded`, `SuccessExitSchema`, `SuccessExit`, `SuccessChunk`, `ErrorSchema`, `Error`, `ErrorExitSchema`, `ErrorExit`, `Exit`, `Services`, `ServicesClient`, `ServicesServer`, `Middleware`, `MiddlewareClient`, `AddError`, `AddMiddleware`, `ToHandler`, `ToHandlerFn`, `IsStream`, `ExtractTag`, `ExtractProvides`, `ExtractRequires`, `ExcludeProvides`, `ResultFrom`, `Prefixed`, `Wrapper`, `WrapperOr`, `isWrapper`, `wrap`, `unwrap`, `wrapMap`, `annotate`, `annotateMerge`, `setPayload`, `setSuccess`, `setError`, `middleware`

### [Rpc.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:902)

Defines one schema-backed procedure. Payload fields, success, failure, defects, streaming, and a primary key become shared client/server contract metadata.

```ts
import { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";

const getUser = Rpc.make("getUser", {
  payload: { id: Schema.String },
  success: Schema.Struct({ id: Schema.String, name: Schema.String }),
  error: Schema.Struct({ code: Schema.String }),
});
```

### [Rpc.setPayload](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:72)

Adds or replaces the request schema while preserving the procedure tag and response schemas.

```ts
const getUser = Rpc.make("getUser").setPayload({ id: Schema.String });
```

### [Rpc.setSuccess](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:72)

Replaces the success schema without changing the request or failure contract.

```ts
const health = Rpc.make("health").setSuccess(Schema.String);
```

### [Rpc.setError](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:72)

Replaces the typed failure schema that clients and handlers share.

```ts
const getUser = Rpc.make("getUser").setError(Schema.Struct({ code: Schema.String }));
```

### [Rpc.middleware](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:72)

Attaches typed middleware requirements and middleware errors to a procedure contract.

```ts
declare const AuthMiddleware: import("effect/unstable/rpc").RpcMiddleware.AnyService;
const protectedRpc = getUser.middleware(AuthMiddleware);
```

### [Rpc.custom](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:1000)

Builds a reusable RPC constructor that transforms the success and error schemas, useful for conventions such as pagination or envelopes.

```ts
const paginated = Rpc.custom((schemas) => ({
  ...schemas,
  success: Schema.Struct({ items: Schema.Array(schemas.success) }),
}));
const listUsers = paginated("listUsers", { success: Schema.String });
```

### [Rpc.exitSchema](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:1121)

Builds the cached schema used to encode and decode an RPC exit, including typed errors, middleware failures, stream failures, and defects.

```ts
const response = Rpc.exitSchema(getUser);
```

### [Rpc.prefix](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:72)

Namespaces a procedure tag without changing its payload or response schemas.

```ts
const adminGetUser = getUser.prefix("admin.");
```

### [Rpc.fork](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:1246)

Marks a handler result for concurrent execution, bypassing the server concurrency gate.

```ts
const handler = Rpc.fork(Effect.succeed({ accepted: true }));
```

### [Rpc.uninterruptible](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:1254)

Marks a handler result to run in an uninterruptible region.

```ts
const handler = Rpc.uninterruptible(Effect.succeed({ committed: true }));
```

### [Rpc.isRpc](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/Rpc.ts:40)

Checks an unknown value before treating it as an RPC definition at a dynamic boundary.

```ts
declare const value: unknown;
if (Rpc.isRpc(value)) {
  console.log(value._tag);
}
```
