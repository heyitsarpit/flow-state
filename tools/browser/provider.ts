// A Vitest browser provider over the browsers installed on this Mac: Chrome, headless with a
// throwaway profile and driven through the DevTools protocol, and Safari through
// /usr/bin/safaridriver and WebDriver. Nothing is downloaded.
//
// Each run starts only its own processes and ends only those, by exact pid: Chrome by the pid it
// spawned; Safari's driver by its pid, and the automation Safari the driver launched by its pid.
// safaridriver has launchd start that Safari, so its parent is launchd, not the driver: it is
// found as the one Safari absent before the run whose parent is this run's safaridriver or
// launchd and whose command line carries `--automation`. A run that fails while opening, or is
// interrupted (SIGINT, SIGTERM), ends them too.
//
// The page commands `hidePage` and `showPage` hide and show the tab the tests run in: Chrome by
// opening a second tab in front of it and closing it again, Safari by a WebDriver new tab and a
// switch back.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { defineBrowserProvider } from "@vitest/browser";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SAFARIDRIVER = "/usr/bin/safaridriver";
// Safari lives in the system cryptex on current macOS; match the bundle path inside any root.
const SAFARI = "Safari.app/Contents/MacOS/Safari";
const WEBDRIVER_PORT = 47823;

type Page = { readonly hide: () => Promise<void>; readonly show: () => Promise<void> };

// Every process of this machine: pid, parent pid and command line.
const processes = () =>
  execFileSync("/bin/ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" })
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);

      return match === null ? [] : [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] ?? "" }];
    });

const alive = (pid: number) => processes().some((p) => p.pid === pid);

// Notes a process this run started in the runner's pid file (FLOW_BROWSER_PIDS), as its pid and
// command line, so the runner can hard-kill exactly it if this process is killed past its cap.
const started = (pid: number | undefined) => {
  const file = process.env["FLOW_BROWSER_PIDS"];
  const command = processes().find((p) => p.pid === pid)?.command;
  if (file === undefined || pid === undefined || command === undefined) return;
  appendFileSync(file, `${JSON.stringify({ pid, command })}\n`);
};

// Ends one process this run started, by its exact pid, and waits up to 5 s for it to go.
const end = async (pid: number, why: string) => {
  if (!alive(pid)) return;
  console.log(`browser run: ending ${why} (pid ${pid})`);
  process.kill(pid, "SIGTERM");

  for (let n = 0; n < 50 && alive(pid); n++) await wait(100);
  if (alive(pid)) process.kill(pid, "SIGKILL");
};

// A DevTools protocol connection to Chrome's browser target.
const devtools = async (port: number) => {
  const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as {
    webSocketDebuggerUrl: string;
  };
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const waiting = new Map<number, (value: { result?: unknown; error?: unknown }) => void>();
  let next = 0;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: unknown };
    if (message.id !== undefined) waiting.get(message.id)?.(message);
  });

  const send = async <A>(method: string, params: Record<string, unknown> = {}) => {
    const id = ++next;
    const answer = await new Promise<{ result?: unknown; error?: unknown }>((resolve) => {
      waiting.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
    if (answer.error !== undefined) throw new Error(`${method}: ${JSON.stringify(answer.error)}`);

    return answer.result as A;
  };

  return { send, close: () => socket.close() };
};

const chrome = () => {
  let child: ChildProcess | undefined;
  let profile: string | undefined;
  let protocol: Awaited<ReturnType<typeof devtools>> | undefined;
  let front: string | undefined;

  const pageTarget = async () => {
    const { targetInfos } = await protocol!.send<{ targetInfos: Array<{ targetId: string; type: string; url: string }> }>(
      "Target.getTargets",
    );
    const page = targetInfos.find((t) => t.type === "page" && t.url.startsWith("http"));
    if (page === undefined) throw new Error("no test page among Chrome's targets");

    return page.targetId;
  };

  const page: Page = {
    hide: async () => {
      const { targetId } = await protocol!.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
      front = targetId;
      await protocol!.send("Target.activateTarget", { targetId });
    },
    show: async () => {
      const tests = await pageTarget();
      if (front !== undefined) await protocol!.send("Target.closeTarget", { targetId: front });
      front = undefined;
      await protocol!.send("Target.activateTarget", { targetId: tests });
    },
  };

  return {
    page,
    open: async (url: string) => {
      profile = mkdtempSync(join(tmpdir(), "flow-browser-chrome-"));
      child = spawn(
        CHROME,
        [
          "--headless=new",
          `--user-data-dir=${profile}`,
          "--remote-debugging-port=0",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-extensions",
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          url,
        ],
        { stdio: "ignore" },
      );
      started(child.pid);
      console.log(`browser run: Chrome ${execFileSync(CHROME, ["--version"], { encoding: "utf8" }).trim()} (pid ${child.pid})`);
      const portFile = join(profile, "DevToolsActivePort");
      for (let n = 0; n < 100 && !existsSync(portFile); n++) await wait(100);
      protocol = await devtools(Number(readFileSync(portFile, "utf8").split("\n")[0]));
    },
    close: async () => {
      protocol?.close();
      if (child?.pid !== undefined) await end(child.pid, "Chrome");
      if (profile !== undefined) rmSync(profile, { recursive: true, force: true });
      child = undefined;
      profile = undefined;
    },
  };
};

const safari = () => {
  const base = `http://127.0.0.1:${WEBDRIVER_PORT}`;
  let driver: ChildProcess | undefined;
  let session: string | undefined;
  let automation: number | undefined;
  let tests: string | undefined;
  let front: string | undefined;
  const before = new Set<number>();

  const webdriver = async <A>(method: string, path: string, body?: unknown) => {
    const response = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const json = (await response.json().catch(() => ({}))) as { value?: A };
    if (!response.ok) throw new Error(`${method} ${path} ${response.status}: ${JSON.stringify(json.value)}`);

    return json.value as A;
  };

  const page: Page = {
    hide: async () => {
      const { handle } = await webdriver<{ handle: string }>("POST", `/session/${session}/window/new`, { type: "tab" });
      front = handle;
      await webdriver("POST", `/session/${session}/window`, { handle });
    },
    show: async () => {
      if (front !== undefined) await webdriver("DELETE", `/session/${session}/window`);
      front = undefined;
      await webdriver("POST", `/session/${session}/window`, { handle: tests });
    },
  };

  return {
    page,
    open: async (url: string) => {
      for (const p of processes()) if (p.command.includes(SAFARI)) before.add(p.pid);
      driver = spawn(SAFARIDRIVER, ["-p", String(WEBDRIVER_PORT)], { stdio: "ignore" });
      started(driver.pid);
      console.log(`browser run: safaridriver (pid ${driver.pid})`);

      for (let n = 0; n < 50; n++) {
        if (await fetch(`${base}/status`).then((r) => r.ok, () => false)) break;
        await wait(100);
      }

      const created = await webdriver<{ sessionId: string; capabilities: { browserVersion?: string } }>("POST", "/session", {
        capabilities: { alwaysMatch: { browserName: "safari" } },
      });
      session = created.sessionId;
      const launched = processes().filter(
        (p) =>
          p.command.includes(SAFARI) &&
          !before.has(p.pid) &&
          p.command.includes("--automation") &&
          (p.ppid === driver?.pid || p.ppid === 1),
      );
      if (launched.length !== 1) throw new Error(`expected one automation Safari, found ${launched.length}`);
      automation = launched[0]?.pid;
      started(automation);
      console.log(`browser run: Safari ${created.capabilities.browserVersion ?? ""} (pid ${automation}, parent ${launched[0]?.ppid})`);
      await webdriver("POST", `/session/${session}/url`, { url });
      tests = await webdriver<string>("GET", `/session/${session}/window`);
      // Bring the tests' window to the front, so the page starts shown, not occluded.
      await webdriver("POST", `/session/${session}/window`, { handle: tests });
      await webdriver("POST", `/session/${session}/window/maximize`, {}).catch(() => undefined);
    },
    close: async () => {
      if (session !== undefined) await webdriver("DELETE", `/session/${session}`).catch(() => undefined);
      session = undefined;
      if (driver?.pid !== undefined) await end(driver.pid, "safaridriver");
      if (automation !== undefined) await end(automation, "the automation Safari");
      driver = undefined;
      automation = undefined;
    },
  };
};

let current: Page | undefined;

/**
 * The provider: one browser per run, named by the instance (`chrome` or `safari`).
 */
export const realBrowser = () =>
  defineBrowserProvider({
    name: "real",
    providerFactory(project) {
      const browser = project.config.browser.name === "safari" ? safari() : chrome();
      let opened = false;

      const stop = () => {
        void browser.close().finally(() => process.exit(130));
      };

      return {
        name: "real",
        supportsParallelism: false,
        getCommandsContext: () => ({}),
        openPage: async (_session: string, url: string) => {
          if (opened) return;
          opened = true;
          process.once("SIGINT", stop);
          process.once("SIGTERM", stop);
          current = browser.page;
          await browser.open(url).catch(async (error: unknown) => {
            await browser.close();
            throw error;
          });
          // FLOW_BROWSER_START_HIDDEN=1 hides the tests' tab before they run, as a locked display
          // does, so the display-bound guard can be shown in either mode on any browser.
          if (process.env["FLOW_BROWSER_START_HIDDEN"] === "1") await browser.page.hide();
        },
        close: async () => {
          if (!opened) return;
          opened = false;
          process.off("SIGINT", stop);
          process.off("SIGTERM", stop);
          await browser.close();
        },
      };
    },
  });

/**
 * The page commands a browser test calls: hide and show its own tab.
 */
export const pageCommands = {
  hidePage: async () => {
    await current?.hide();
  },
  showPage: async () => {
    await current?.show();
  },
};
