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
  kill(): Promise<void>; // SIGKILL, the profile stays
  restart(): Promise<void>; // the same profile, a new process
  close(): Promise<void>; // and the profile goes
};
let nextPort = 9400 + Math.floor(Math.random() * 400);
export const launch = async (
  o: { rssLimitMb?: number; profile?: string } = {},
): Promise<Browser> => {
  const profile = o.profile ?? mkdtempSync(join(tmpdir(), "flow-cdp-"));
  const port = nextPort++;
  let proc: ReturnType<typeof Bun.spawn>;
  let peak = 0;
  const start = async () => {
    proc = Bun.spawn(
      [
        CHROME,
        "--headless=new",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-gpu",
        "--disable-extensions",
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
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
    kill: async () => {
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
