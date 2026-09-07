import { spawn } from "node:child_process";
import { createServer } from "node:net";

const availablePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("could not allocate an acceptance port"));
        return;
      }
      const port = address.port;
      server.close((cause) => (cause === undefined ? resolve(port) : reject(cause)));
    });
  });

const apiPort = String(await availablePort());
const webPort = String(await availablePort());
const child = spawn("nubx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    ACCEPTANCE: "1",
    INCIDENT_API_PORT: apiPort,
    INCIDENT_WEB_PORT: webPort,
    INCIDENT_API_URL: `http://127.0.0.1:${apiPort}`,
    INCIDENT_WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
    NEXT_PUBLIC_INCIDENT_API_URL: `http://127.0.0.1:${apiPort}`,
  },
});

const stop = () => child.kill("SIGTERM");
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
child.once("exit", (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

