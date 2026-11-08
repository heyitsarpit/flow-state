import { MARK } from "./core.ts";

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

export type Stream = { readonly head: string; readonly tail: string; readonly lastLine: string; readonly dropped: number; readonly marks: number; readonly abandoned: boolean };
export type Decision = "rss" | "time" | "budget" | "closed";
export type Ended = {
  readonly kind: "ended";
  readonly launch: Launch;
  readonly exit: number | null;
  readonly signal: string | null;
  readonly decided: Decision | null;
  readonly killed: boolean;
  readonly peakMb: number;
  readonly ms: number;
  readonly stdout: Stream;
  readonly stderr: Stream;
  readonly leftovers: number;
  readonly unreaped: boolean;
  readonly blindTicks: number;
};
export type Unstarted = { readonly kind: "unstarted"; readonly launch: Launch; readonly message: string };
export type Run = Ended | Unstarted;

export const HEAD_BYTES = 8 * 1024 * 1024;
export const TAIL_BYTES = 1024 * 1024;
export const LAST_LINE_BYTES = 64 * 1024 * 1024;
export const DRAIN_GRACE_MS = 2000;
export const REAP_GRACE_MS = 10_000;
export const PS_TIMEOUT_MS = 5000;

export const killed = (decided: Decision | null, sentToLive: boolean, signal: string | null): boolean => decided !== null && sentToLive && signal !== null;
export const isTop = (): boolean => process.env["FLOW_NESTED"] !== "1";
export const isAlone = (): boolean => process.env["FLOW_ALONE"] === "1";
export const runId = (): string => process.env["FLOW_RUN"] || "top";
export const processStart = (pid: number): string | null => {
  try {
    const p = Bun.spawnSync(["ps", "-o", "lstart=", "-p", String(pid)], { stdin: "ignore", timeout: PS_TIMEOUT_MS });
    const s = p.exitCode === 0 ? p.stdout.toString().trim() : "";
    return s === "" ? null : s;
  } catch {
    return null;
  }
};
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

const MARK_BYTES = new TextEncoder().encode(MARK);
class Collector {
  private head: Uint8Array[] = [];
  private headBytes = 0;
  private rest: Uint8Array[] = [];
  private restStart = 0;
  private total = 0;
  private lastNl = -1;
  private prevNl = -1;
  private marks = 0;
  private lineHead = 0;
  private lineMatches = true;
  constructor(private readonly echo: ((b: Uint8Array) => void) | null) {}
  private count(chunk: Uint8Array) {
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i]!;
      if (b === 10) {
        this.lineHead = 0;
        this.lineMatches = true;
        continue;
      }
      if (this.lineHead < MARK_BYTES.length) {
        if (this.lineMatches && b !== MARK_BYTES[this.lineHead]) this.lineMatches = false;
        this.lineHead++;
        if (this.lineHead === MARK_BYTES.length && this.lineMatches) this.marks++;
      } else {
        const nl = chunk.indexOf(10, i);
        if (nl < 0) return;
        i = nl - 1;
      }
    }
  }
  push(chunk: Uint8Array) {
    this.echo?.(chunk);
    this.count(chunk);
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
  done(abandoned: boolean): Stream {
    const dec = (b: Uint8Array) => new TextDecoder().decode(b);
    const head = dec(Buffer.concat(this.head));
    const restBuf = Buffer.concat(this.rest);
    const lineAt = this.lineAt();
    const tailAt = Math.max(this.headBytes, lineAt - TAIL_BYTES, this.restStart);
    const off = (at: number) => Math.max(0, at - this.restStart);
    const tail = dec(restBuf.subarray(off(tailAt), off(lineAt)));
    const lastLine = dec(restBuf.subarray(off(lineAt)));
    const kept = this.headBytes + (this.total - tailAt);
    return { head, tail, lastLine, dropped: this.total - kept, marks: this.marks, abandoned };
  }
}

const drain = (s: ReadableStream<Uint8Array>, c: Collector) => {
  const reader = s.getReader();
  const finished = (async () => {
    for (;;) {
      const r = await reader.read();
      if (r.done) return;
      c.push(r.value);
    }
  })();
  return {
    finished,
    abandon: () => {
      void reader.cancel().catch(() => {});
    },
    collector: c,
  };
};

type Proc = { pid: number; ppid: number; pgid: number; rssKb: number; started: string };
const table = (): Proc[] | null => {
  try {
    const p = Bun.spawnSync(["ps", "-Ao", "pid=,ppid=,pgid=,rss=,lstart="], { stdin: "ignore", timeout: PS_TIMEOUT_MS });
    if (p.exitCode !== 0) return null;
    const out: Proc[] = [];
    for (const l of p.stdout.toString().split("\n")) {
      const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(l);
      if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), rssKb: Number(m[4]), started: m[5]! });
    }
    return out;
  } catch {
    return null;
  }
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
    child = Bun.spawn([...launch.cmd], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: childEnv(launch), cwd: launch.cwd, detached: true });
  } catch (e) {
    return { kind: "unstarted", launch, message: (e as Error).message };
  }
  const toErr = o.echo ? (b: Uint8Array) => void process.stderr.write(b) : null;
  const toOut = o.echo === "same" ? (b: Uint8Array) => void process.stdout.write(b) : toErr;
  const out = drain(child.stdout as ReadableStream<Uint8Array>, new Collector(toOut));
  const err = drain(child.stderr as ReadableStream<Uint8Array>, new Collector(toErr));
  let peakMb = 0;
  let decided: Decision | null = null;
  let sentToLive = false;
  let done = false;
  const seen = new Map<number, string>();
  void child.exited.then(() => (done = true));
  const endTree = () => {
    const procs = treeOf(child.pid, table() ?? [], seen);
    for (const p of procs)
      try {
        process.kill(p.pid, 9);
      } catch {}
    try {
      process.kill(-child.pid, 9);
    } catch {}
    return procs;
  };
  let blindTicks = 0;
  while (!done) {
    await Bun.sleep(40);
    if (done) break;
    const procs = table();
    if (procs === null) blindTicks++;
    else {
      const tree = treeOf(child.pid, procs, seen);
      for (const p of tree) seen.set(p.pid, p.started);
      peakMb = Math.max(peakMb, tree.reduce((n, p) => n + p.rssKb, 0) / 1024);
      if (!o.stop.aborted && tree.reduce((n, p) => n + p.rssKb, 0) / 1024 > launch.limits.mb) decided = "rss";
    }
    if (done) break;
    if (decided === null && o.stop.aborted) decided = o.stop.reason === "closed" ? "closed" : "budget";
    if (decided === null && performance.now() - t0 > launch.limits.seconds * 1000) decided = "time";
    if (decided) {
      sentToLive = child.exitCode === null && child.signalCode === null;
      endTree();
      break;
    }
  }
  let reapTimer: ReturnType<typeof setTimeout> | undefined;
  const reaped = await Promise.race([child.exited.then(() => true), new Promise<false>((r) => (reapTimer = setTimeout(() => r(false), REAP_GRACE_MS)))]);
  clearTimeout(reapTimer);
  const signal = reaped ? (child.signalCode ?? null) : "SIGKILL";
  const left = decided ? [] : endTree();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<"late">((r) => (timer = setTimeout(() => r("late"), DRAIN_GRACE_MS)));
  const drained = await Promise.race([Promise.all([out.finished, err.finished]).then(() => "drained" as const), grace]);
  clearTimeout(timer);
  if (drained === "late") {
    out.abandon();
    err.abandon();
  }
  return {
    kind: "ended",
    launch,
    exit: signal === null ? child.exitCode : null,
    signal,
    decided,
    killed: killed(decided, sentToLive, signal),
    peakMb: Math.round(peakMb),
    ms: Math.round(performance.now() - t0),
    stdout: out.collector.done(drained === "late"),
    stderr: err.collector.done(drained === "late"),
    leftovers: left.length,
    unreaped: !reaped,
    blindTicks,
  };
};
