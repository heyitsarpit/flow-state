// D132: the real runtime, broken in one named way. Each is something a green must not survive. FLOW_BROKEN says which, FLOW_BROKEN_BASE which runtime. bun main.ts --runtime ./broken-adapter.ts
import type { Port, RuntimeModule } from "./harness.ts";

const kind = process.env["FLOW_BROKEN"] ?? "";
const base = (await import(process.env["FLOW_BROKEN_BASE"] ?? "../round-13/adapter.ts")) as RuntimeModule;
export const BROKEN = ["constantHash", "lyingFatal", "noEvidence", "noWaits", "bogusIssue", "lyingReplay", "junkDiskKey", "extraRequest"] as const;

export const port: Port = {
  disk: base.port.disk,
  boot(a) {
    const args = {
      ...a,
      ...(kind === "noEvidence" ? { onEvidence: () => {} } : {}),
      ...(kind === "junkDiskKey"
        ? {
            host: {
              ...a.host,
              storage: {
                ...a.host.storage,
                write: (w: any, p: any, answer: any) => a.host.storage.write([...w, { key: "junk/x", value: "1" }], p, answer),
              },
            },
          }
        : {}),
    };
    const i = base.port.boot(args as never);
    let saidBogus = false;
    return {
      ...i,
      ...(kind === "constantHash" ? { stateText: () => "x" } : {}),
      ...(kind === "lyingFatal" ? { fatal: () => true } : {}),
      ...(kind === "noWaits" ? { waits: () => [] } : {}),
      ...(kind === "lyingReplay" ? { replay: () => ({ same: false, firstDiff: "a lie" }) } : {}),
      ...(kind === "bogusIssue"
        ? {
            ensure: (x: string, m: string, input: unknown) => {
              if (!saidBogus) a.onIssue([{ code: "BOGUS_UNNAMED" }]);
              saidBogus = true;
              i.ensure(x, m, input);
            },
            // Lifetime experiment: an attach is an ensure too, and a case may make its actor live only by attaching.
            ...(i.attach
              ? {
                  attach: (x: string, m: string, input: unknown, owner: string, existing?: boolean, identity?: readonly string[], persist?: boolean) => {
                    if (!saidBogus) a.onIssue([{ code: "BOGUS_UNNAMED" }]);
                    saidBogus = true;
                    i.attach!(x, m, input, owner, existing, identity, persist);
                  },
                }
              : {}),
          }
        : {}),
    };
  },
};
