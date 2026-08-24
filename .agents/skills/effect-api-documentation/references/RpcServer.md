# Unstable `RpcServer`

Import from `effect/unstable/rpc`. This API is unstable; the pinned local
`effect@4.0.0-beta.86` source is authoritative. See the [official Effect v4
RpcServer API](https://www.effect.website/docs/v4/api/effect/unstable/rpc/RpcServer).

## API index

1. [RpcServer.layerHttp](#rpcserverlayerhttp)
2. [RpcServer.make](#rpcservermake)
3. [RpcServer.layer](#rpcserverlayer)
4. [RpcServer.toHttpEffect](#rpcservertohttpeffect)
5. [RpcServer.toHttpEffectWebsocket](#rpcservertohttpeffectwebsocket)
6. [RpcServer.layerProtocolHttp](#rpcserverlayerprotocolhttp)
7. [RpcServer.layerProtocolWebsocket](#rpcserverlayerprotocolwebsocket)
8. [RpcServer.layerProtocolSocketServer](#rpcserverlayerprotocolsocketserver)
9. [RpcServer.layerProtocolStdio](#rpcserverlayerprotocolstdio)
10. [RpcServer.layerProtocolWorkerRunner](#rpcserverlayerprotocolworkerrunner)
11. [RpcServer.makeNoSerialization](#rpcservermakenoserialization)

### Additional known APIs (not expanded)

`RpcServer`, `Protocol`, `Protocol.make`, `makeProtocolSocketServer`, `makeProtocolWithHttpEffect`, `makeProtocolWithHttpEffectWebsocket`, `makeProtocolHttp`, `makeProtocolWebsocket`, `makeProtocolStdio`, `makeProtocolWorkerRunner`, `supportsAck`, `supportsTransferables`, `supportsSpanPropagation`, `disconnects`, `clientIds`, `initialMessage`, `write`, `disconnect`

### [RpcServer.layerHttp](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:797)

Starts a scoped RPC server and registers it on an HTTP router using HTTP or WebSocket transport.

```ts
const server = RpcServer.layerHttp({
  group,
  path: "/rpc",
  protocol: "http",
});
```

### [RpcServer.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:489)

Runs handlers for an RPC group through the current server protocol, decoding requests and encoding responses.

```ts
const server = RpcServer.make(group, { concurrency: 16 });
const program = server.pipe(Effect.provide(handlerLayer), Effect.scoped);
```

### [RpcServer.layer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:768)

Provides a scoped layer that starts the RPC server in the background and keeps it tied to the caller's lifetime.

```ts
const serverLayer = RpcServer.layer(group, { concurrency: 16 });
const app = Effect.never.pipe(Effect.provide(serverLayer));
```

### [RpcServer.toHttpEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:1171)

Returns an HTTP effect for serving RPC requests when the host application owns route registration and server lifecycle.

```ts
const httpHandler = RpcServer.toHttpEffect(group);
```

### [RpcServer.toHttpEffectWebsocket](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:1212)

Returns an HTTP upgrade effect for serving the WebSocket RPC protocol through an existing HTTP server.

```ts
const upgradeHandler = RpcServer.toHttpEffectWebsocket(group);
```

### [RpcServer.layerProtocolHttp](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:1158)

Provides a server protocol that receives RPC messages through HTTP POST routes registered on the current router.

```ts
const protocol = RpcServer.layerProtocolHttp({ path: "/rpc" });
```

### [RpcServer.layerProtocolWebsocket](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:953)

Provides a WebSocket protocol and registers its upgrade route on the current HTTP router.

```ts
const protocol = RpcServer.layerProtocolWebsocket({ path: "/rpc" });
```

### [RpcServer.layerProtocolSocketServer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:886)

Provides a protocol backed by the current `SocketServer`, including connection and disconnection tracking.

```ts
const protocol = RpcServer.layerProtocolSocketServer;
```

### [RpcServer.layerProtocolStdio](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:1314)

Provides a stdio protocol for RPC servers driven by stdin and stdout, useful for local tools and process integrations.

```ts
const protocol = RpcServer.layerProtocolStdio;
```

### [RpcServer.layerProtocolWorkerRunner](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:1385)

Provides a worker-runner protocol that routes worker messages to the server and supports transferable values.

```ts
const protocol = RpcServer.layerProtocolWorkerRunner;
```

### [RpcServer.makeNoSerialization](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/rpc/RpcServer.ts:84)

Runs a server over already-decoded messages, which is useful for tests and custom transports that own serialization.

```ts
const server = RpcServer.makeNoSerialization(group, {
  onFromServer: (message) => sendDecoded(message),
});
```
