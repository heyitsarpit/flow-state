import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const apiUrl = process.env.INCIDENT_API_URL ?? "http://127.0.0.1:5190";
const faults = [
  "delayed-response",
  "refresh-503",
  "malformed-detail",
  "remove-before-detail",
  "sse-disconnect",
  "timeline-burst",
  "delayed-patch",
  "delayed-runbook",
  "shift-before-list",
  "runbook-failure",
  "runbook-cancel-race",
];

const post = async (path, body) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
};

const [command, value] = process.argv.slice(2);

if (command === "list") {
  process.stdout.write(`seeds: normal, empty\nfaults: ${faults.join(", ")}\n`);
} else if (command === "reset" && (value === "normal" || value === "empty")) {
  await post("/__dev/reset", { seed: value });
  process.stdout.write(`reset ${value}; reload the queue and expect the ${value} dataset\n`);
} else if (command === "arm" && faults.includes(value)) {
  await post("/__dev/faults", { fault: value });
  process.stdout.write(
    value === "timeline-burst"
      ? "emitted timeline-burst for INC-002; open that incident and verify the visible gap and bounded history\n"
      : `armed ${value}; perform the next matching UI action once and verify its visible recovery\n`,
  );
} else if (command === "restart-api") {
  const pid = Number(
    await readFile(resolve(import.meta.dirname, "..", ".incident-api.pid"), "utf8"),
  );
  process.kill(pid, "SIGTERM");
  process.stdout.write(
    "restarting API; keep the frontend open, observe degraded connection state, then retry or reconnect without reloading\n",
  );
} else {
  process.stderr.write(
    "usage: scenario list | scenario reset <normal|empty> | scenario arm <fault> | scenario restart-api\n",
  );
  process.exitCode = 2;
}

