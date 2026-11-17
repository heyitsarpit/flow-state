import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes of the Runtime's life: an admit cell that runs what it should reject or drop, a
 * host that ignores a rejection, and a disposal that ends before its write is answered, hides a
 * refused write, outlives its bound or stops writing after its start; each planted alone like the
 * runtime's other faults.
 */
export const lifeFaults: ReadonlyArray<Fault> = [
  {
    name: "ensure-while-disposing-runs",
    tests: ["src/core/life.test.ts", "src/host/life.test.ts"],
    says: "an ensure while the Runtime is disposing runs instead of rejecting RuntimeDisposed",
    rule: "Actors R22",
    edits: [
      {
        file: "src/core/life.ts",
        find: "  Ensure: call,",
        replace: "  Ensure: { ...call, Disposing: run },",
      },
    ],
  },
  {
    name: "dispose-actor-before-ready-runs",
    tests: ["src/core/life.test.ts", "src/host/life.test.ts"],
    says: "disposeActor before ready runs instead of rejecting RuntimeNotReady",
    rule: "Actors R4",
    edits: [
      {
        file: "src/core/life.ts",
        find: "  DisposeActor: { ...call, Disposing: drop, Disposed: drop },",
        replace: "  DisposeActor: { ...call, Inert: run, Disposing: drop, Disposed: drop },",
      },
    ],
  },
  {
    name: "boot-after-dispose-runs",
    tests: ["src/core/life.test.ts", "src/host/lanes.test.ts"],
    says: "a bootstrap that ends after dispose opens the Runtime",
    rule: "Actors R4",
    edits: [
      {
        file: "src/core/life.ts",
        find: "  Boot: {\n    Inert: drop,\n    Booting: run,\n    Open: drop,\n    Failed: drop,\n    Disposing: disposed,\n    Disposed: disposed,",
        replace:
          "  Boot: {\n    Inert: drop,\n    Booting: run,\n    Open: drop,\n    Failed: drop,\n    Disposing: disposed,\n    Disposed: run,",
      },
    ],
  },
  {
    name: "failed-boot-retried",
    tests: ["src/core/life.test.ts", "src/host/life.test.ts"],
    says: "a ready after a failed bootstrap runs the bootstrap again",
    rule: "Actors R2",
    edits: [
      {
        file: "src/core/life.ts",
        find: "  Start: {\n    Inert: run,\n    Booting: drop,\n    Open: drop,\n    Failed: drop,",
        replace:
          "  Start: {\n    Inert: run,\n    Booting: drop,\n    Open: drop,\n    Failed: run,",
      },
    ],
  },
  {
    name: "host-ignores-rejected-ready",
    tests: ["src/host/life.test.ts"],
    says: "ready after dispose waits for a bootstrap that never runs instead of rejecting",
    rule: "Actors I42",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "      Reject: ({ code }) => Effect.fail(rejected(code)),",
        replace: "      Reject: () => Deferred.await(booted),",
      },
    ],
  },
  {
    name: "disposal-done-before-its-write",
    tests: ["tests/actors/runtime-disposal.test.ts"],
    says: "the disposal ends while its write is still unanswered",
    rule: "Actors R23",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: '    if (!Life.$is("Disposing")(tx.world().life) || Option.isSome(awaiting())) return;',
        replace: '    if (!Life.$is("Disposing")(tx.world().life)) return;',
      },
    ],
  },
  {
    name: "refused-final-write-silent",
    tests: ["tests/actors/runtime-disposal.test.ts"],
    says: "a refused disposal write ends the disposal with no StorageFailure",
    rule: "Actors I43",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: "    else {\n      tx.act(Act.WriteFailed());\n      end();",
        replace: "    else {\n      end();",
      },
    ],
  },
  {
    name: "final-write-unbounded",
    tests: ["tests/actors/runtime-disposal.test.ts"],
    says: "a disposal write unanswered at the bound keeps the disposal waiting past it",
    rule: "Actors I43",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: "    if (Option.isSome(awaiting())) tx.act(Act.WriteFailed());\n    end();",
        replace: "    if (Option.isNone(awaiting())) end();",
      },
    ],
  },
  {
    name: "disposal-writes-once",
    tests: ["tests/actors/runtime-disposal.test.ts", "src/host/lanes.test.ts"],
    says: "the disposal writes only at its start, so a call settling within the bound is unwritten",
    rule: "Actors R23",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: "    if (!tx.world().persistence || (!first && !persistence.marked())) return;",
        replace: "    if (!tx.world().persistence || !first) return;",
      },
    ],
  },
  {
    name: "empty-write-unanswered",
    tests: ["tests/actors/runtime-disposal.test.ts"],
    says: "a disposal write with nothing left to write is never answered, so the disposal waits for its bound",
    rule: "Actors R23",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "        settle(carried, true);\n",
        replace: "        out = false;\n",
      },
    ],
  },
  {
    name: "hidden-listener-outlives-runtime",
    tests: ["src/host/runtime.test.ts"],
    says: "a disposed Runtime keeps its page-hidden listener, which still issues writes into a closed Scope",
    rule: "Actors R22",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "  fibers.finalize(\n    host.onHidden(",
        replace: "  Array.of(\n    host.onHidden(",
      },
    ],
  },
  {
    name: "defect-keeps-runtime",
    tests: ["src/host/runtime.test.ts"],
    says: "a defect inside a step leaves the Runtime running on its half-written world",
    rule: "Actors R25",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "    world = stopped(world);\n",
        replace: "",
      },
    ],
  },
  {
    name: "stopped-runtime-runs-calls",
    tests: ["src/host/runtime.test.ts"],
    says: "a Runtime a defect stopped still runs public calls on its half-written world",
    rule: "Actors R25",
    edits: [
      {
        file: "src/core/life.ts",
        find: "  Disposed: disposed,\n  Stopped: disposed,\n};",
        replace: "  Disposed: disposed,\n  Stopped: run,\n};",
      },
    ],
  },
  {
    name: "stopped-dispose-succeeds",
    tests: ["src/host/runtime.test.ts"],
    says: "dispose() of a Runtime a defect stopped reports success instead of the defect",
    rule: "Actors R25",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "    Deferred.doneUnsafe(disposed, Exit.die(defect));",
        replace: "    Deferred.doneUnsafe(disposed, Exit.void);",
      },
    ],
  },
  {
    name: "stopped-dispose-actor-returns",
    tests: ["src/core/life.test.ts", "src/host/runtime.test.ts"],
    says: "disposeActor on a Runtime a defect stopped returns normally instead of refusing RuntimeDisposed",
    rule: "Actors R25",
    edits: [
      {
        file: "src/core/life.ts",
        find: "  DisposeActor: { ...call, Disposing: drop, Disposed: drop },",
        replace: "  DisposeActor: { ...call, Disposing: drop, Disposed: drop, Stopped: drop },",
      },
    ],
  },
  {
    name: "stopped-refusal-says-disposed",
    tests: ["src/host/runtime.test.ts"],
    says: "a call refused after a stop says it came after dispose()",
    rule: "Actors R25",
    edits: [
      {
        file: "src/core/life.ts",
        find: 'export const endedBy = (life: Life) => (Life.$is("Stopped")(life) ? "stop" : "dispose");',
        replace:
          'export const endedBy = (life: Life) => (Life.$is("Stopped")(life) ? "dispose" : "dispose");',
      },
    ],
  },
  {
    name: "stopped-record-reads-active",
    tests: ["src/host/runtime.test.ts"],
    says: "after a stop, an identity with only a saved record still reads active",
    rule: "Actors R25",
    edits: [
      {
        file: "src/host/snapshot.ts",
        find: '      lifecycle: restingLifecycleOf(world.life, "active"),',
        replace: '      lifecycle: "active",',
      },
    ],
  },
  {
    name: "stopped-ended-reads-disposed",
    tests: ["src/host/runtime.test.ts"],
    says: "after a stop, an ended actor's snapshot still reads disposed",
    rule: "Actors R25",
    edits: [
      {
        file: "src/host/snapshot.ts",
        find: '    lifecycle: restingLifecycleOf(world.life, "disposed"),',
        replace: '    lifecycle: "disposed",',
      },
    ],
  },
  {
    name: "stopped-runtime-writes",
    tests: ["src/host/runtime.test.ts"],
    says: "a Runtime a defect stopped runs a disposal over its half-written world, which then may write it",
    rule: "Actors R25",
    edits: [
      {
        file: "src/core/life.ts",
        find: "    Failed: run,\n    Disposing: drop,\n    Disposed: drop,\n    Stopped: drop,",
        replace: "    Failed: run,\n    Disposing: drop,\n    Disposed: drop,\n    Stopped: run,",
      },
      {
        file: "src/core/disposal.ts",
        find: '  const disposeRuntime = () => (Life.$is("Open")(tx.world().life) ? started() : end());',
        replace:
          '  const disposeRuntime = () =>\n    Life.$is("Open")(tx.world().life) || Life.$is("Stopped")(tx.world().life) ? started() : end();',
      },
    ],
  },
];
