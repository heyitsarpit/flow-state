# RuntimeSetup is the Story runtime recipe

Status: archived accepted decision record; transferred into the active contracts.

`RuntimeSetup` is the typed app-bound inert recipe, created by `runtimeSetup(...)`, shared by live hosts and
`story.app`. `RuntimeSetup.construct()` is synchronous and performs no storage I/O, Implementation
acquisition, actor creation, or external work. It returns one fresh production `Runtime`; `runtime.ready()`
is the one public readiness Effect that performs bootstrap/restoration once and caches its terminal result.
The `Runtime` owns lifecycle and cleanup. Stories receive the setup rather than a bare app or an already-created
runtime so direct and CLI Story runs cannot share state or bypass production bootstrap.

The same runtime pattern applies to `story.machine`. The machine Story implementation may privately
compile a focused one-machine `AppPlan` derived from a gateway-admitted machine and construct a fixture-backed
RuntimeSetup, but it still
uses the production Runtime, Implementation, actor engine, evidence, and cleanup path. If the
machine's requirements are `never`, no Implementation is needed; otherwise fixtures can provide or
replace the required capabilities.

Discovery and gateway registration remain synchronous and inert. Runtime construction and readiness occur
only at the shared Story execution boundary; boot payloads, decoders, and hydration coordinators remain
package-private.
