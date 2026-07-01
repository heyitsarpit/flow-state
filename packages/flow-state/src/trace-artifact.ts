import type {
  FlowEvent,
  FlowSnapshot,
  FlowTraceArtifact,
  FlowTraceArtifactOptions,
  FlowTraceArtifactSnapshot,
  FlowTraceDescriptor,
} from "./core/api/types.js";

import { createTraceDescriptor } from "./trace-descriptor.js";

type ImportedTraceSnapshot = FlowSnapshot<unknown, string, FlowEvent>;
type ImportedTraceDescriptor = FlowTraceDescriptor<
  ImportedTraceSnapshot,
  FlowTraceArtifactOptions | undefined
>;

const traceArtifactVersion = "flow-state/trace-artifact.v1" as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTraceArtifactOptions(value: unknown): value is FlowTraceArtifactOptions {
  return isRecord(value);
}

function isTraceArtifactSnapshot(value: unknown): value is FlowTraceArtifactSnapshot {
  return (
    isRecord(value) &&
    typeof value.machineId === "string" &&
    typeof value.value === "string" &&
    "context" in value &&
    isRecord(value.resources) &&
    isRecord(value.transactions) &&
    isRecord(value.streams) &&
    isRecord(value.timers) &&
    isRecord(value.children) &&
    Array.isArray(value.receipts)
  );
}

function traceArtifactSnapshot(trace: FlowTraceDescriptor): FlowTraceArtifactSnapshot {
  return Object.freeze({
    machineId: trace.snapshot.machine.id,
    value: trace.snapshot.value,
    context: trace.snapshot.context,
    resources: trace.snapshot.resources,
    transactions: trace.snapshot.transactions,
    streams: trace.snapshot.streams,
    timers: trace.snapshot.timers,
    children: trace.snapshot.children,
    receipts: trace.snapshot.receipts,
  });
}

function importedTraceSnapshot(snapshot: FlowTraceArtifactSnapshot): ImportedTraceSnapshot {
  const machine = Object.freeze({
    kind: "machine" as const,
    id: snapshot.machineId,
    config: Object.freeze({
      id: snapshot.machineId,
      initial: snapshot.value,
      context: () => snapshot.context,
      states: Object.freeze({
        [snapshot.value]: Object.freeze({}),
      }),
    }),
    getInitialSnapshot: () => importedTraceSnapshot(snapshot),
  });

  return Object.freeze({
    machine,
    value: snapshot.value,
    context: snapshot.context,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
  });
}

function isTraceArtifact(value: unknown): value is FlowTraceArtifact {
  return (
    isRecord(value) &&
    value.kind === "trace-artifact" &&
    value.version === traceArtifactVersion &&
    isTraceArtifactSnapshot(value.snapshot) &&
    (value.options === undefined || isTraceArtifactOptions(value.options))
  );
}

async function readStreamBytes<Chunk extends Uint8Array>(
  stream: ReadableStream<Chunk>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Array<Chunk> = [];
  let totalLength = 0;

  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }

    chunks.push(next.value);
    totalLength += next.value.byteLength;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function createBlobStream(value: string | ArrayBuffer): ReadableStream<Uint8Array<ArrayBuffer>> {
  return new Blob([value]).stream();
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function transformStreamBytes(
  stream: ReadableStream<Uint8Array<ArrayBuffer>>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  const reader = stream.getReader();
  const pump = (async () => {
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) {
          break;
        }

        await writer.write(next.value);
      }

      await writer.close();
    } catch (error) {
      await writer.abort(error);
      throw error;
    } finally {
      reader.releaseLock();
    }
  })();

  const [bytes] = await Promise.all([readStreamBytes(transform.readable), pump]);
  return bytes;
}

export function exportTraceArtifact(trace: FlowTraceDescriptor): FlowTraceArtifact {
  return Object.freeze({
    kind: "trace-artifact" as const,
    version: traceArtifactVersion,
    snapshot: traceArtifactSnapshot(trace),
    ...(trace.options === undefined ? {} : { options: trace.options }),
  });
}

export function importTraceArtifact(value: unknown): ImportedTraceDescriptor | undefined {
  if (!isTraceArtifact(value)) {
    return undefined;
  }

  return createTraceDescriptor(importedTraceSnapshot(value.snapshot), value.options);
}

export async function compressTraceArtifact(
  trace: FlowTraceDescriptor,
): Promise<Uint8Array | undefined> {
  if (typeof CompressionStream !== "function") {
    return undefined;
  }

  const json = JSON.stringify(exportTraceArtifact(trace));
  return transformStreamBytes(createBlobStream(json), new CompressionStream("gzip"));
}

export async function decompressTraceArtifact(
  bytes: Uint8Array,
): Promise<ImportedTraceDescriptor | undefined> {
  if (typeof DecompressionStream !== "function") {
    return undefined;
  }

  try {
    const jsonBytes = await transformStreamBytes(
      createBlobStream(copyBytesToArrayBuffer(bytes)),
      new DecompressionStream("gzip"),
    );
    const json = new TextDecoder().decode(jsonBytes);
    return importTraceArtifact(JSON.parse(json));
  } catch {
    return undefined;
  }
}
