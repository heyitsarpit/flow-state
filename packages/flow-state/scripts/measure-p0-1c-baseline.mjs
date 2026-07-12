#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDir, "..");
const repoRoot = resolve(packageRoot, "../..");

const typeProofs = [
  {
    label: "multi-entry root/react19/testing/server/inspect",
    tsconfig: resolve(repoRoot, "examples/typescript-proof-multi-entry/tsconfig.json"),
    declarationDir: resolve(repoRoot, "examples/typescript-proof-multi-entry/dist"),
  },
  {
    label: "packed React 18",
    tsconfig: resolve(repoRoot, "examples/typescript-proof-packed-react-18/tsconfig.json"),
    declarationDir: resolve(repoRoot, "examples/typescript-proof-packed-react-18/dist"),
  },
  {
    label: "packed React 19",
    tsconfig: resolve(repoRoot, "examples/typescript-proof-packed-react-19/tsconfig.json"),
    declarationDir: resolve(repoRoot, "examples/typescript-proof-packed-react-19/dist"),
  },
];

const scalingTiers = [
  { name: "small", operations: 64, keyDepth: 3 },
  { name: "medium", operations: 256, keyDepth: 6 },
  { name: "adversarial", operations: 1_024, keyDepth: 12 },
];

function run(command, args, options = {}) {
  const startedAt = performance.now();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  const durationMs = performance.now() - startedAt;

  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    durationMs,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function assertOk(result) {
  if (result.status !== 0) {
    throw new Error(
      [
        `${result.command} failed with exit ${result.status}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
}

function parseExtendedDiagnostics(output) {
  const metrics = {};

  for (const line of output.split(/\r?\n/u)) {
    const match = /^(?<name>[A-Za-z][A-Za-z ]+):\s+(?<value>[0-9.]+)(?<unit>K|M|s)?$/u.exec(
      line.trim(),
    );
    if (!match?.groups) {
      continue;
    }

    const key = match.groups.name.trim().replaceAll(" ", "");
    const value = Number(match.groups.value);
    if (!Number.isFinite(value)) {
      continue;
    }

    metrics[key] = match.groups.unit === "s" ? value * 1_000 : value;
  }

  return {
    files: metrics.Files,
    types: metrics.Types,
    instantiations: metrics.Instantiations,
    memoryUsedKb: metrics.Memoryused,
    checkTimeMs: metrics.Checktime,
    emitTimeMs: metrics.Emittime,
    totalTimeMs: metrics.Totaltime,
  };
}

function walkFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function byteStats(directory, predicate = () => true) {
  const files = walkFiles(directory).filter(predicate);
  const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
  const gzipBytes = gzipSync(
    Buffer.concat(
      files.flatMap((file) => [
        Buffer.from(relative(repoRoot, file)),
        Buffer.from([0]),
        readFileSync(file),
      ]),
    ),
  ).byteLength;

  return {
    files: files.length,
    bytes,
    gzipBytes,
  };
}

function declarationFile(path) {
  return path.endsWith(".d.ts") || path.endsWith(".d.mts");
}

function packagePayloadStats() {
  const files = [resolve(packageRoot, "package.json"), ...walkFiles(resolve(packageRoot, "dist"))];
  const bytes = files.reduce((total, file) => total + statSync(file).size, 0);
  const gzipBytes = gzipSync(
    Buffer.concat(
      files.flatMap((file) => [
        Buffer.from(relative(packageRoot, file)),
        Buffer.from([0]),
        readFileSync(file),
      ]),
    ),
  ).byteLength;

  return {
    files: files.length,
    bytes,
    gzipBytes,
  };
}

function nestedKey(seed, depth) {
  let value = { leaf: seed };
  for (let index = 0; index < depth; index += 1) {
    value = {
      level: index,
      left: value,
      right: [seed, index, { stable: true }],
    };
  }
  return value;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

async function measureOperation(operation) {
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const result = await operation();
    const durationMs = performance.now() - startedAt;
    const heapAfter = process.memoryUsage().heapUsed;
    samples.push({
      durationMs,
      heapDeltaBytes: heapAfter - heapBefore,
      result,
    });
  }

  return {
    medianMs: median(samples.map((sample) => sample.durationMs)),
    rangeMs: [
      Math.min(...samples.map((sample) => sample.durationMs)),
      Math.max(...samples.map((sample) => sample.durationMs)),
    ],
    heapDeltaRangeBytes: [
      Math.min(...samples.map((sample) => sample.heapDeltaBytes)),
      Math.max(...samples.map((sample) => sample.heapDeltaBytes)),
    ],
    result: samples.at(-1)?.result,
  };
}

async function measureScaling() {
  const flow = await import(pathToFileURL(resolve(packageRoot, "dist/index.mjs")).href);
  const { Effect, Stream } = await import("effect");

  const keyResource = flow.resource({
    id: "p0.1c.key",
    key: (id, key) => flow.createKey("p0.1c", id, key),
    lookup: (id) => Effect.succeed({ id }),
  });
  const counterMachine = flow.machine({
    id: "p0.1c.counter",
    initial: "ready",
    context: () => ({ count: 0 }),
    states: {
      ready: {
        on: {
          TICK: {
            update: ({ context }) => ({ count: context.count + 1 }),
          },
        },
      },
    },
  });
  const saveTransaction = flow.transaction({
    id: "p0.1c.save",
    params: ({ context }) => ({ id: context.id, count: context.count }),
    commit: (params) => Effect.succeed({ id: params.id, count: params.count }),
    routes: flow.outcomes({
      success: ({ value }) => ({ type: "SAVED", value }),
    }),
    concurrency: "serialize",
  });
  const transactionMachine = flow.machine({
    id: "p0.1c.transaction",
    initial: "ready",
    context: () => ({ id: "project-1", count: 0 }),
    states: {
      ready: {
        on: {
          SAVE: {
            submit: saveTransaction,
            update: ({ context }) => ({ count: context.count + 1 }),
          },
          SAVED: {},
        },
      },
    },
  });

  function createRuntime() {
    const layer = flow
      .app({
        modules: [],
      })
      .layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.test(),
        services: [],
      });
    return flow.runtime(layer);
  }

  async function withRuntime(work) {
    const runtime = createRuntime();
    try {
      return await work(runtime);
    } finally {
      await runtime.dispose();
    }
  }

  const tiers = [];
  for (const tier of scalingTiers) {
    const { operations, keyDepth } = tier;
    const metrics = {};

    metrics.canonicalKeyDepth = await measureOperation(() => {
      let encodedBytes = 0;
      for (let index = 0; index < operations; index += 1) {
        const ref = keyResource.ref(`project-${index}`, nestedKey(index, keyDepth));
        encodedBytes += JSON.stringify(ref.key).length;
      }
      return { operations, keyDepth, encodedBytes };
    });

    metrics.collectionSize = await measureOperation(() =>
      withRuntime((runtime) => {
        const resources = Array.from({ length: operations }, (_, index) => ({
          ref: keyResource.ref(`project-${index}`, nestedKey(index, Math.min(keyDepth, 4))),
          value: { id: `project-${index}` },
        }));
        runtime.resources.seedResources(resources);
        return {
          operations,
          dehydratedResources: runtime.resources.dehydrate().length,
        };
      }),
    );

    metrics.subscriberChurn = await measureOperation(() =>
      withRuntime((runtime) => {
        const ref = keyResource.ref("project-churn", nestedKey(0, Math.min(keyDepth, 4)));
        runtime.resources.seedResources([{ ref, value: { id: "project-churn" } }]);
        let notifications = 0;
        const unsubscribers = Array.from({ length: operations }, () =>
          runtime.resources.subscribe(ref, () => {
            notifications += 1;
          }),
        );
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
        return { operations, notifications };
      }),
    );

    metrics.nestedPatchWaves = await measureOperation(() =>
      withRuntime((runtime) => {
        const ref = keyResource.ref("project-patch", nestedKey(0, Math.min(keyDepth, 4)));
        runtime.resources.seedResources([{ ref, value: { id: "project-patch", count: 0 } }]);
        let patches = 0;
        for (let outer = 0; outer < Math.max(1, Math.floor(keyDepth / 2)); outer += 1) {
          for (let index = 0; index < operations; index += 1) {
            runtime.resources.patch(ref, (current) => ({
              ...current,
              count: current.count + 1,
            }));
            patches += 1;
          }
        }
        return {
          patches,
          finalCount: runtime.resources.get(ref)?.value?.count,
        };
      }),
    );

    metrics.actorMailboxContention = await measureOperation(() =>
      withRuntime(async (runtime) => {
        const actor = runtime.createActor(counterMachine, { id: `p0.1c.actor.${tier.name}` });
        for (let index = 0; index < operations; index += 1) {
          actor.send({ type: "TICK" });
        }
        await actor.flush();
        const snapshot = actor.snapshot();
        await actor.dispose();
        return {
          operations,
          count: snapshot.context.count,
          receipts: snapshot.receipts.length,
        };
      }),
    );

    metrics.transactionPressure = await measureOperation(() =>
      withRuntime(async (runtime) => {
        const actor = runtime.createActor(transactionMachine, {
          id: `p0.1c.transaction.${tier.name}`,
        });
        for (let index = 0; index < operations; index += 1) {
          actor.send({ type: "SAVE" });
        }
        await actor.flush();
        const snapshot = actor.snapshot();
        await actor.dispose();
        return {
          operations,
          count: snapshot.context.count,
          receipts: snapshot.receipts.length,
        };
      }),
    );

    metrics.streamPressure = await measureOperation(() =>
      withRuntime(async (runtime) => {
        const pressureStream = flow.stream({
          id: `p0.1c.stream.${tier.name}`,
          params: () => operations,
          subscribe: ({ params }) =>
            Stream.fromIterable(Array.from({ length: params }, (_, index) => ({ index }))),
          routes: {
            value: (value) => ({ type: "STREAM_VALUE", value }),
          },
        });
        const streamMachine = flow.machine({
          id: `p0.1c.stream-machine.${tier.name}`,
          initial: "ready",
          context: () => ({ values: 0 }),
          states: {
            ready: {
              invoke: pressureStream,
              on: {
                STREAM_VALUE: {
                  update: ({ context }) => ({ values: context.values + 1 }),
                },
              },
            },
          },
        });
        const actor = runtime.createActor(streamMachine, { id: `p0.1c.stream.${tier.name}` });
        await actor.flush();
        const snapshot = actor.snapshot();
        await actor.dispose();
        return {
          operations,
          values: snapshot.context.values,
          receipts: snapshot.receipts.length,
        };
      }),
    );

    metrics.evidenceRetention = await measureOperation(() =>
      withRuntime(async (runtime) => {
        const actor = runtime.createActor(counterMachine, {
          id: `p0.1c.evidence.${tier.name}`,
        });
        for (let index = 0; index < operations; index += 1) {
          actor.send({ type: "TICK" });
        }
        await actor.flush();
        const receipts = actor.receipts();
        const serializedBytes = Buffer.byteLength(JSON.stringify(receipts), "utf8");
        await actor.dispose();
        return {
          operations,
          receipts: receipts.length,
          serializedBytes,
        };
      }),
    );

    metrics.restore = await measureOperation(() =>
      withRuntime(async (runtime) => {
        const actor = runtime.createActor(counterMachine, {
          id: `p0.1c.restore.${tier.name}`,
        });
        for (let index = 0; index < operations; index += 1) {
          actor.send({ type: "TICK" });
        }
        await actor.flush();
        const serialized = actor.serialize();
        await actor.dispose();

        return withRuntime(async (restoreRuntime) => {
          const restored = restoreRuntime.createActor(counterMachine, {
            id: `p0.1c.restore.${tier.name}`,
            snapshot: serialized,
          });
          await restored.flush();
          const snapshot = restored.snapshot();
          await restored.dispose();
          return {
            operations,
            count: snapshot.context.count,
            serializedBytes: Buffer.byteLength(JSON.stringify(serialized), "utf8"),
          };
        });
      }),
    );

    tiers.push({
      ...tier,
      metrics,
    });
  }

  return tiers;
}

const buildResult = run("pnpm", ["--filter", "flow-state", "build"]);
assertOk(buildResult);

const typeMetrics = [];
for (const proof of typeProofs) {
  const result = run("pnpm", [
    "exec",
    "tsc",
    "--pretty",
    "false",
    "--extendedDiagnostics",
    "-p",
    proof.tsconfig,
  ]);
  assertOk(result);
  typeMetrics.push({
    label: proof.label,
    command: result.command,
    durationMs: result.durationMs,
    diagnostics: parseExtendedDiagnostics(result.stdout),
    declarations: byteStats(proof.declarationDir, declarationFile),
  });
}

const launchWorkspaceDeclaration = run("pnpm", [
  "--filter",
  "@flow-state/launch-workspace",
  "check:typescript-mode-proofs",
]);
assertOk(launchWorkspaceDeclaration);

const baseline = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  build: {
    command: buildResult.command,
    durationMs: buildResult.durationMs,
  },
  typeMetrics,
  packageOutput: {
    distDeclarations: byteStats(resolve(packageRoot, "dist"), declarationFile),
    distAll: byteStats(resolve(packageRoot, "dist")),
    publishPayload: packagePayloadStats(),
  },
  launchWorkspaceDeclaration: {
    command: launchWorkspaceDeclaration.command,
    status: launchWorkspaceDeclaration.status,
    durationMs: launchWorkspaceDeclaration.durationMs,
  },
  scaling: await measureScaling(),
};

console.log(JSON.stringify(baseline, null, 2));
