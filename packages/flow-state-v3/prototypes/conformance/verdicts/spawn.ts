export type Limits = { readonly mb: number; readonly seconds: number };
export type Contract = "gate" | "tool" | "program";

export type RunSpec = {
  readonly gate: string;
  readonly cmd: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly limits: Limits;
  readonly contract: Contract;
};
export type Launch = RunSpec & {
  readonly run: string;
  readonly referenceMb: number | null;
  readonly pool: { readonly slots: number; readonly mb: number };
  readonly alone: boolean;
};

export type Stream = { readonly head: string; readonly tail: string; readonly lastLine: string; readonly dropped: number };
export type Ended = {
  readonly kind: "ended";
  readonly launch: Launch;
  readonly exit: number | null;
  readonly signal: string | null;
  readonly decided: "rss" | "time" | "budget" | null;
  readonly killed: boolean;
  readonly peakMb: number;
  readonly ms: number;
  readonly stdout: Stream;
  readonly stderr: Stream;
  readonly leftovers: number;
};
export type Unstarted = { readonly kind: "unstarted"; readonly launch: Launch; readonly message: string };
export type Run = Ended | Unstarted;

export const HEAD_BYTES = 8 * 1024 * 1024;
export const TAIL_BYTES = 1024 * 1024;
export const LAST_LINE_BYTES = 64 * 1024 * 1024;

export const killed = (decided: Ended["decided"], signal: string | null): boolean => decided !== null && signal !== null;
export const isTop = (): boolean => process.env["FLOW_NESTED"] !== "1";
export const isAlone = (): boolean => process.env["FLOW_ALONE"] === "1";
export const runId = (): string => process.env["FLOW_RUN"] ?? "top";
export const inheritedPool = (): { readonly slots: number; readonly mb: number } | null => {
  const m = /^(\d+):(\d+)$/.exec(process.env["FLOW_POOL"] ?? "");
  return m ? { slots: Number(m[1]), mb: Number(m[2]) } : null;
};
export const inheritedLimitMb = (): number | null => {
  const n = Number(process.env["FLOW_LIMIT_MB"] ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
};
export const text = (s: Stream): string => `${s.head}${s.tail}${s.lastLine}`;
export const programOutput = (run: Ended): { readonly stdout: string; readonly stderr: string; readonly exit: number | null } | null =>
  run.launch.contract === "program" ? { stdout: text(run.stdout), stderr: text(run.stderr), exit: run.exit } : null;

class Collector {
  private head: Uint8Array[] = [];
  private headBytes = 0;
  private rest: Uint8Array[] = [];
  private restStart = 0;
  private total = 0;
  private lastNl = -1;
  private prevNl = -1;
  constructor(private readonly echo: ((b: Uint8Array) => void) | null) {}
  push(chunk: Uint8Array) {
    this.echo?.(chunk);
    let c = chunk;
    if (this.headBytes < HEAD_BYTES) {
      const take = Math.min(c.length, HEAD_BYTES - this.headBytes);
      this.head.push(c.subarray(0, take));
      this.headBytes += take;
      c = c.subarray(take);
    }
    const last = chunk.lastIndexOf(10);
    if (last >= 0) {
      const before = last > 0 ? chunk.lastIndexOf(10, last - 1) : -1;
      this.prevNl = before >= 0 ? this.total + before : this.lastNl;
      this.lastNl = this.total + last;
    }
    this.total += chunk.length;
    if (c.length) {
      if (this.rest.length === 0) this.restStart = this.total - c.length;
      this.rest.push(c);
    }
    this.trim();
  }
  private lineStart() {
    return this.lastNl === this.total - 1 ? this.prevNl + 1 : this.lastNl + 1;
  }
  private lineAt() {
    return Math.max(this.headBytes, this.lineStart(), this.total - LAST_LINE_BYTES);
  }
  private trim() {
    const keep = Math.max(this.headBytes, this.lineAt() - TAIL_BYTES);
    while (this.rest.length > 1 && this.restStart + this.rest[0]!.length <= keep) {
      this.restStart += this.rest[0]!.length;
      this.rest.shift();
    }
  }
  done(): Stream {
    const dec = (parts: readonly Uint8Array[]) => new TextDecoder().decode(Buffer.concat(parts));
    const head = dec(this.head);
    const restBuf = Buffer.concat(this.rest);
    const lineAt = this.lineAt();
    const tailAt = Math.max(this.headBytes, lineAt - TAIL_BYTES, this.restStart);
    const off = (at: number) => Math.max(0, at - this.restStart);
    const tail = new TextDecoder().decode(restBuf.subarray(off(tailAt), off(lineAt)));
    const lastLine = new TextDecoder().decode(restBuf.subarray(off(lineAt)));
    const kept = this.headBytes + (this.total - tailAt);
    return { head, tail, lastLine, dropped: this.total - kept };
  }
}

const drain = async (s: ReadableStream<Uint8Array>, c: Collector) => {
  for await (const chunk of s) c.push(chunk);
  return c.done();
};

type Proc = { pid: number; ppid: number; pgid: number; rssKb: number; started: string };
const table = (): Proc[] => {
  const p = Bun.spawnSync(["ps", "-Ao", "pid=,ppid=,pgid=,rss=,lstart="], { stdin: "ignore" });
  const out: Proc[] = [];
  for (const l of p.stdout.toString().split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l);
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), rssKb: Number(m[4]), started: m[5]! });
  }
  return out;
};
const treeOf = (root: number, procs: readonly Proc[], seen: ReadonlyMap<number, string>): Proc[] => {
  const kids = new Map<number, Proc[]>();
  for (const p of procs) {
    const l = kids.get(p.ppid);
    if (l) l.push(p);
    else kids.set(p.ppid, [p]);
  }
  const out = new Map<number, Proc>();
  const walk = (p: Proc) => {
    if (out.has(p.pid)) return;
    out.set(p.pid, p);
    for (const k of kids.get(p.pid) ?? []) walk(k);
  };
  for (const p of procs) if (p.pid !== process.pid && (p.pid === root || p.pgid === root || seen.get(p.pid) === p.started)) walk(p);
  return [...out.values()];
};

export const childEnv = (launch: Launch): Record<string, string> =>
  launch.contract === "program"
    ? { ...(process.env as Record<string, string>), ...launch.env }
    : {
        ...(process.env as Record<string, string>),
        ...launch.env,
        FLOW_NESTED: "1",
        FLOW_RUN: launch.run,
        FLOW_POOL: `${launch.pool.slots}:${launch.pool.mb}`,
        FLOW_LIMIT_MB: String(launch.limits.mb),
        ...(launch.alone ? { FLOW_ALONE: "1" } : {}),
      };

export const spawnRun = async (launch: Launch, o: { readonly echo: boolean | "same"; readonly stop: AbortSignal }): Promise<Run> => {
  const t0 = performance.now();
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn([...launch.cmd], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: childEnv(launch),
      cwd: launch.cwd,
      detached: true,
    });
  } catch (e) {
    return { kind: "unstarted", launch, message: (e as Error).message };
  }
  const toErr = o.echo ? (b: Uint8Array) => void process.stderr.write(b) : null;
  const toOut = o.echo === "same" ? (b: Uint8Array) => void process.stdout.write(b) : toErr;
  const out = drain(child.stdout as ReadableStream<Uint8Array>, new Collector(toOut));
  const err = drain(child.stderr as ReadableStream<Uint8Array>, new Collector(toErr));
  let peakMb = 0;
  let decided: Ended["decided"] = null;
  let done = false;
  const seen = new Map<number, string>();
  void child.exited.then(() => (done = true));
  const endTree = () => {
    const procs = treeOf(child.pid, table(), seen);
    for (const p of procs)
      try {
        process.kill(p.pid, 9);
      } catch {}
    try {
      process.kill(-child.pid, 9);
    } catch {}
    return procs;
  };
  while (!done) {
    await Bun.sleep(40);
    if (done) break;
    const tree = treeOf(child.pid, table(), seen);
    for (const p of tree) seen.set(p.pid, p.started);
    const mb = tree.reduce((n, p) => n + p.rssKb, 0) / 1024;
    peakMb = Math.max(peakMb, mb);
    if (done) break;
    if (o.stop.aborted) decided = "budget";
    else if (mb > launch.limits.mb) decided = "rss";
    else if (performance.now() - t0 > launch.limits.seconds * 1000) decided = "time";
    if (decided) {
      endTree();
      break;
    }
  }
  await child.exited;
  const signal = child.signalCode ?? null;
  const left = decided ? [] : endTree();
  const [stdout, stderr] = await Promise.all([out, err]);
  return {
    kind: "ended",
    launch,
    exit: signal === null ? child.exitCode : null,
    signal,
    decided,
    killed: killed(decided, signal),
    peakMb: Math.round(peakMb),
    ms: Math.round(performance.now() - t0),
    stdout,
    stderr,
    leftovers: left.length,
  };
};
