import { spawn } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiPort = process.env.INCIDENT_API_PORT ?? "5190";
const webPort = process.env.INCIDENT_WEB_PORT ?? "5187";
const apiUrl = process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? `http://127.0.0.1:${apiPort}`;
const pidPath = resolve(root, ".incident-api.pid");
const tsx = resolve(root, "../../node_modules/.bin/tsx");
let stopping = false;
let api;

const startApi = () => {
  api = spawn(tsx, ["server/index.ts"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, INCIDENT_API_PORT: apiPort },
  });
  void writeFile(pidPath, String(api.pid));
  api.once("exit", (code, signal) => {
    if (!stopping) {
      process.stderr.write(`incident-api exited (${code ?? signal}); restarting\n`);
      setTimeout(startApi, 100);
    }
  });
};

startApi();
const web = spawn(
  "nubx",
  ["next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", webPort],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_INCIDENT_API_URL: apiUrl },
  },
);

const shutdown = () => {
  if (stopping) return;
  stopping = true;
  api?.kill("SIGTERM");
  web.kill("SIGTERM");
  void rm(pidPath, { force: true });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
web.once("exit", (code) => {
  shutdown();
  process.exitCode = code ?? 0;
});
