// Raw CDP over a WebSocket, no dependency. Local Chrome, a throwaway profile, closed afterward. Reports not run if Chrome cannot start
// unattended; it fakes nothing. Prior art: round 2's s4-run.ts.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const treeRssMb = (root: number) => {
  const out = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid=,rss="]).stdout.toString();
  const kids = new Map<number, Array<[number, number]>>();
  for (const l of out.trim().split("\n")) {
    const [p, pp, r] = l.trim().split(/\s+/).map(Number) as [number, number, number];
    (kids.get(pp) ?? kids.set(pp, []).get(pp)!).push([p, r]);
  }
  let kb = 0;
  const walk = (p: number) => {
    for (const [c, r] of kids.get(p) ?? []) {
      kb += r;
      walk(c);
    }
  };
  walk(root);
  return Math.round(kb / 1024);
};
export type Page = {
  send(method: string, params?: object): Promise<any>;
  evaluate<T = any>(expression: string, timeoutMs?: number): Promise<T>;
  close(): void;
  crashed: boolean;
};
export type Browser = {
  version: string;
  pid: number;
  peakMb(): number;
  newPage(url: string): Promise<Page>;
  // D105: what dies, by name. Round 7 called the first a "whole-browser kill"; the review showed it is not, and that only it has been seen to wipe an origin.
  killMain(): Promise<void>; // SIGKILL of the main process only. Its children outlive it for a moment. The profile stays
  kill(): Promise<void>; // `killMain`, under the name round 7's folder calls it
  killTree(): Promise<void>; // SIGKILL of the main process and every child, one `ps` later. The profile stays
  crashBrowser(): Promise<void>; // CDP `Browser.crash`: the browser's own crash path, the profile stays
  quit(): Promise<void>; // CDP `Browser.close`: a clean exit. The profile stays
  restart(): Promise<void>; // the same profile, a new process
  close(): Promise<void>; // and the profile goes
};
let nextPort = 9400 + Math.floor(Math.random() * 400);
export const launch = async (
  o: { rssLimitMb?: number; profile?: string; throttled?: boolean; args?: readonly string[]; logFile?: string } = {},
): Promise<Browser> => {
  const profile = o.profile ?? mkdtempSync(join(tmpdir(), "flow-cdp-"));
  const port = nextPort++;
  let proc: ReturnType<typeof Bun.spawn>;
  let peak = 0;
  let starts = 0;
  const start = async () => {
    proc = Bun.spawn(
      [
        CHROME,
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        ...(o.throttled ? [] : ["--disable-background-timer-throttling"]), // review: real tabs are throttled, so a hide run keeps it on
        ...(o.args ?? []),
        "--disable-gpu",
        "--disable-extensions",
        "about:blank",
      ],
      { stdout: "ignore", stderr: o.logFile ? Bun.file(`${o.logFile}.${++starts}`) : "ignore" },
    );
    for (let i = 0; i < 80; i++) {
      await Bun.sleep(150);
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) return (await r.json()) as any;
      } catch {}
    }
    proc.kill(9);
    throw new Error("Chrome's debugging port did not answer");
  };
  let version = await start();
  const guard = setInterval(() => {
    const mb = treeRssMb(proc.pid) + 0;
    peak = Math.max(peak, mb);
    if (mb > (o.rssLimitMb ?? 1800)) {
      console.error(`RSS limit: chrome tree at ${mb} MB`);
      proc.kill(9);
    }
  }, 500);
  const connect = async (wsUrl: string): Promise<Page> => {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    let id = 0;
    const wait = new Map<number, (v: any) => void>();
    const page: Page = {
      crashed: false,
      send: (method, params = {}) =>
        new Promise<any>((res, rej) => {
          const n = ++id;
          wait.set(n, res);
          try {
            ws.send(JSON.stringify({ id: n, method, params }));
          } catch (e) {
            rej(e);
          }
        }),
      evaluate: async (expression, timeoutMs = 120_000) => {
        const r = await page.send("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
          timeout: timeoutMs,
        });
        if (r.result?.exceptionDetails)
          throw new Error(
            r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text,
          );
        return r.result?.result?.value;
      },
      close: () => ws.close(),
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.method === "Inspector.targetCrashed") page.crashed = true;
      if (m.id) {
        wait.get(m.id)?.(m);
        wait.delete(m.id);
      }
    };
    ws.onclose = () => {
      for (const [k, f] of wait) {
        f({ error: "closed" });
        wait.delete(k);
      }
    };
    await page.send("Inspector.enable");
    return page;
  };
  return {
    get version() {
      return version.Browser as string;
    },
    get pid() {
      return proc.pid;
    },
    peakMb: () => peak,
    newPage: async (url) => {
      const r = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
        method: "PUT",
      });
      const t = (await r.json()) as any;
      const page = await connect(t.webSocketDebuggerUrl);
      const close = page.close;
      // A page closed here is a target gone, or memory piles up across a kill loop.
      page.close = () => {
        close();
        void fetch(`http://127.0.0.1:${port}/json/close/${t.id}`).catch(() => {});
      };
      return page;
    },
    killMain: async () => {
      proc.kill(9);
      await proc.exited;
    },
    kill: async () => {
      proc.kill(9);
      await proc.exited;
    },
    killTree: async () => {
      const out = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid="]).stdout.toString();
      const kids = new Map<number, number[]>();
      for (const l of out.trim().split("\n")) {
        const [p, pp] = l.trim().split(/\s+/).map(Number) as [number, number];
        (kids.get(pp) ?? kids.set(pp, []).get(pp)!).push(p);
      }
      const all: number[] = [];
      const walk = (p: number) => {
        for (const c of kids.get(p) ?? []) {
          all.push(c);
          walk(c);
        }
      };
      walk(proc.pid);
      proc.kill(9);
      for (const c of all)
        try {
          process.kill(c, 9);
        } catch {}
      await proc.exited;
    },
    quit: async () => {
      const v = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as any;
      const ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = rej;
      });
      ws.send(JSON.stringify({ id: 1, method: "Browser.close", params: {} }));
      await Promise.race([proc.exited, Bun.sleep(8000)]);
      proc.kill(9);
      await proc.exited;
    },
    crashBrowser: async () => {
      const v = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as any;
      const ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = rej;
      });
      ws.send(JSON.stringify({ id: 1, method: "Browser.crash", params: {} }));
      await Promise.race([proc.exited, Bun.sleep(5000)]);
      proc.kill(9);
      await proc.exited;
    },
    restart: async () => {
      version = await start();
    },
    close: async () => {
      clearInterval(guard);
      proc.kill(9);
      await proc.exited;
      if (!o.profile)
        try {
          rmSync(profile, { recursive: true, force: true });
        } catch {}
    },
  };
};
