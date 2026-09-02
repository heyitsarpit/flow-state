# Unstable `RpcClient`

Import from `effect/unstable/rpc`. This API is unstable; the pinned local
`effect@4.0.0-beta.86` source is authoritative. See the [official Effect v4
RpcClient API](https://www.effect.website/docs/v4/api/effect/unstable/rpc/RpcClient).

`RpcClient` derives typed client methods from RPC definitions and supplies protocol Layers for calling a remote endpoint.

## API index

1. [RpcClient.make](#rpcclientmake)
2. [RpcClient.withHeaders](#rpcclientwithheaders)
3. [RpcClient.layerProtocolHttp](#rpcclientlayerprotocolhttp)
4. [RpcClient.layerProtocolSocket](#rpcclientlayerprotocolsocket)
5. [RpcClient.layerProtocolWorker](#rpcclientlayerprotocolworker)
6. [RpcClient.makeNoSerialization](#rpcclientmakenoserialization)
7. [RpcClient.Protocol.make](#rpcclientprotocolmake)
8. [RpcClient.ConnectionHooks](#rpcclientconnectionhooks)

### Additional known APIs (not expanded)

`RpcClient`, `RpcClient.From`, `RpcClient.Flat`, `FromGroup`, `makeProtocolHttp`, `makeProtocolSocket`, `makeProtocolWorker`, `CurrentHeaders`, `Protocol`, `ConnectionHooks`, `RpcClientError`, `RpcClientDefect`, `layerProtocolSocket`, `layerProtocolWorker`, `withHeaders`, `supportsAck`, `supportsTransferables`

### [RpcClient.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:627)

Creates a schema-aware client whose methods are derived from an RPC group and return typed `Effect` or `Stream` values.

```ts
import { Effect } from "effect";
import { RpcClient } from "effect/unstable/rpc";

declare const group: Parameters<typeof RpcClient.make>[0];
const program = Effect.gen(function*() {
  const client = yield* RpcClient.make(group);
  return yield* client.getUser({ id: "user-1" });
});
```

### [RpcClient.withHeaders](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:823)

Adds headers to one effect and merges them with the current client header context.

```ts
const request = RpcClient.withHeaders(
  client.getUser({ id: "user-1" }),
  { authorization: "Bearer token" },
);
```

### [RpcClient.layerProtocolHttp](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:985)

Provides an HTTP client protocol layer for an RPC endpoint; the surrounding application supplies the `HttpClient` and serialization services.

```ts
const transport = RpcClient.layerProtocolHttp({ url: "https://api.example.com/rpc" });
const program = clientEffect.pipe(Effect.provide(transport));
```

### [RpcClient.layerProtocolSocket](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:1175)

Provides a socket-backed protocol with optional transient-error retry behavior.

```ts
const transport = RpcClient.layerProtocolSocket({ retryTransientErrors: true });
const program = clientEffect.pipe(Effect.provide(transport));
```

### [RpcClient.layerProtocolWorker](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:1356)

Provides a worker-pool protocol for parallel RPC work and transferable values.

```ts
const transport = RpcClient.layerProtocolWorker({ size: 4, concurrency: 2 });
const program = clientEffect.pipe(Effect.provide(transport));
```

### [RpcClient.makeNoSerialization](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:217)

Creates a client over an already-decoded message channel, useful for custom transports, tests, or an in-process boundary.

```ts
const client = RpcClient.makeNoSerialization(group, {
  onFromClient: ({ message }) => sendDecoded(message),
});
```

### [RpcClient.Protocol.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:844)

Builds a custom client transport service around encoded message sending and response delivery.

```ts
const protocol = RpcClient.Protocol.make((writeResponse) =>
  Effect.succeed({
    send: (_clientId, request) => sendEncoded(request, writeResponse),
    supportsAck: false,
    supportsTransferables: false,
  }),
);
```

### [RpcClient.ConnectionHooks](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcClient.ts:1386)

Provides optional connection and disconnection effects for transport setup, metrics, or cleanup.

```ts
const hooks = RpcClient.ConnectionHooks.of({
  onConnect: Effect.log("rpc connected"),
  onDisconnect: Effect.log("rpc disconnected"),
});
```
