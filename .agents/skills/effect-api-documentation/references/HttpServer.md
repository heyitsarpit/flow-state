# `HttpServer` (unstable)

Import from `effect/unstable/http`. This module defines the injectable server
service and layers that connect an HTTP response effect to a running server.

Source: [Effect v4 `HttpServer` API](https://www.effect.website/docs/v4/api/effect/unstable/http/HttpServer).

## API index

1. [HttpServer.HttpServer](#httpserverhttpserver)
2. [HttpServer.make](#httpservermake)
3. [HttpServer.serve](#httpserverserve)
4. [HttpServer.serveEffect](#httpserverserveeffect)
5. [HttpServer.formatAddress](#httpserverformataddress)
6. [HttpServer.addressFormattedWith](#httpserveraddressformattedwith)
7. [HttpServer.withLogAddress](#httpserverwithlogaddress)
8. [HttpServer.makeTestClient](#httpservermaketestclient)
9. [HttpServer.layerTestClient](#httpserverlayertestclient)
10. [HttpServer.layerServices](#httpserverlayerservices)

### Additional known APIs (not expanded)

`HttpServer.Address`, `HttpServer.TcpAddress`, `HttpServer.UnixAddress`, `HttpServer.logAddress`

### [HttpServer.HttpServer](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:38)

`HttpServer` is the injectable service that supplies the server's `serve` operation and bound address.

```ts
import { Effect } from "effect"
import { HttpServer } from "effect/unstable/http"

const server = HttpServer
```

### [HttpServer.make](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:100)

Creates an `HttpServer` implementation from a transport-specific serving function and address.

```ts
import { HttpServer } from "effect/unstable/http"

const server = HttpServer.make({
  address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 3000 },
  serve: () => Effect.void,
})
```

### [HttpServer.serve](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:123)

Creates a layer that runs an HTTP response effect with the current server and request service.

```ts
import { Effect } from "effect"
import { HttpServer, HttpServerResponse } from "effect/unstable/http"

const serverLayer = HttpServer.serve(
  Effect.succeed(HttpServerResponse.text("ok")),
)
```

### [HttpServer.serveEffect](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:172)

Runs the serving operation as an effect when the application controls the surrounding scope directly.

```ts
import { Effect } from "effect"
import { HttpServer, HttpServerResponse } from "effect/unstable/http"

const serve = HttpServer.serveEffect(Effect.succeed(HttpServerResponse.text("ok")))
```

### [HttpServer.formatAddress](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:216)

Formats TCP and Unix server addresses for logs and diagnostics.

```ts
const address = HttpServer.formatAddress({
  _tag: "TcpAddress",
  hostname: "127.0.0.1",
  port: 3000,
})
```

### [HttpServer.addressFormattedWith](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:232)

Reads and formats the current server address before passing it to an effectful callback.

```ts
import { Effect } from "effect"

const log = HttpServer.addressFormattedWith((address) => Effect.log(`Listening on ${address}`))
```

### [HttpServer.withLogAddress](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:256)

Adds startup address logging to a layer that provides an `HttpServer`.

```ts
const loggedServer = HttpServer.withLogAddress(serverLayer)
```

### [HttpServer.makeTestClient](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:278)

Builds a client pointed at the current TCP test server, avoiding hard-coded ports in integration tests.

```ts
const testClient = HttpServer.makeTestClient
```

### [HttpServer.layerTestClient](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:300)

Provides the test client as a layer for tests that run against a live in-process server.

```ts
const testClientLayer = HttpServer.layerTestClient
```

### [HttpServer.layerServices](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/unstable/http/HttpServer.ts:318)

Provides the common platform services needed by HTTP server tests, including a no-op file system.

```ts
const services = HttpServer.layerServices
```
