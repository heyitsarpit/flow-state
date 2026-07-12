import { describe, expect, it } from "vite-plus/test";

const docs = import.meta.glob(
  "../../../{TASK.md,CAPACITY_POLICY.md,COMPATIBILITY_CORPUS.md,LAWS_AND_ORACLES.md,tasks/SEMANTIC_DECISIONS.md,tasks/EFFECT_ARCHITECTURE.md,architecture/correctness/BASELINE.md,OWNER_MAP.md}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

function requireDoc(path: string): string {
  const source = docs[path];
  expect(source).toBeDefined();
  if (!source) {
    throw new Error(`Missing ${path}`);
  }
  return source;
}

describe("correctness plan architecture", () => {
  it("keeps P0.6 synthesis artifacts wired into the tracker", () => {
    const task = requireDoc("../../../TASK.md");

    expect(task).toContain("| P0.6");
    expect(task).toContain("[Capacity policy](./CAPACITY_POLICY.md)");
    expect(task).toContain("[Compatibility corpus](./COMPATIBILITY_CORPUS.md)");
    expect(task).toContain("[Laws and independent oracles](./LAWS_AND_ORACLES.md)");
    expect(requireDoc("../../../CAPACITY_POLICY.md")).toContain("# Capacity policy");
    expect(requireDoc("../../../COMPATIBILITY_CORPUS.md")).toContain("# Compatibility corpus");
    expect(requireDoc("../../../LAWS_AND_ORACLES.md")).toContain("# Laws and independent oracles");
  });

  it("keeps every session bounded to one ready packet in the sole status authority", () => {
    const task = requireDoc("../../../TASK.md");

    expect(task).toContain("## Recovery packet definitions");
    expect(task).toContain("| R0.2");
    expect(task).toContain("| Ready");
    expect(task).toContain("Execute exactly one status-table packet marked `Ready`");
    expect(task).toContain("Do not inspect or begin that successor");
  });

  it("records every DEC handoff with owner, compatibility, rejected alternatives, and tests", () => {
    const decisions = requireDoc("../../../tasks/SEMANTIC_DECISIONS.md");

    for (let index = 1; index <= 22; index += 1) {
      expect(decisions).toContain(`| DEC-${index}`);
    }

    expect(decisions).toContain("Ownership and publication sentences");
    expect(decisions).toContain("resource.instance.ambiguous");
    expect(decisions).toContain("pure-initial-snapshot/adoption");
    expect(decisions).toContain("Owner/publication point");
    expect(decisions).toContain("Compatibility impact");
    expect(decisions).toContain("Rejected alternatives");
    expect(decisions).toContain("Required tests");
  });

  it("keeps Effect architecture concrete enough for runtime families", () => {
    const effect = requireDoc("../../../tasks/EFFECT_ARCHITECTURE.md");

    for (const phrase of [
      "P0.6 concrete service, Layer, and Scope graph",
      "ResourceStore scoped service",
      "OrchestratorSystem scoped service",
      "transaction attempts",
      "stream fibers",
      "timer sleeps",
      "child actor scopes",
      "ManagedRuntime at host/request/test/CLI boundary",
    ]) {
      expect(effect).toContain(phrase);
    }
  });

  it("keeps capacity, compatibility, and law rows for the future proof packets", () => {
    const capacity = requireDoc("../../../CAPACITY_POLICY.md");
    const compatibility = requireDoc("../../../COMPATIBILITY_CORPUS.md");
    const laws = requireDoc("../../../LAWS_AND_ORACLES.md");

    for (const row of [
      "ResourceStore records",
      "Actor mailbox",
      "Transaction serialize queues",
      "Stream buffers",
      "Evidence log",
      "Hydration payload",
      "React leases",
      "CLI output/evidence export",
    ]) {
      expect(capacity).toContain(row);
    }

    for (const surface of [
      "Source API",
      "Runtime behavior",
      "Receipts/evidence",
      "Wire/boot",
      "Packed exports",
      "Peer/environment",
    ]) {
      expect(compatibility).toContain(surface);
    }

    for (const law of [
      "Resource identity",
      "App identity",
      "Reads and `can`",
      "Lifecycle",
      "Batch publication",
      "Queue/admission",
      "Projection/evidence",
      "Round trip",
    ]) {
      expect(laws).toContain(law);
    }
  });

  it("keeps P0.1c measurement and owner evidence available to P0.6", () => {
    expect(requireDoc("../../../architecture/correctness/BASELINE.md")).toContain(
      "P0.1c packed and performance fixture baseline",
    );
    expect(requireDoc("../../../OWNER_MAP.md")).toContain("ResourceStore");
  });
});
