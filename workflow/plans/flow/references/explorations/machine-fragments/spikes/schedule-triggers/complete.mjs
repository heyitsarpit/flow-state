// Usage: node complete.mjs <file>   -- file contains a marker "/*|*/"; prints completions at the marker via tsc --lsp.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(process.argv[2]);
const text = readFileSync(file, "utf8").replace("/*|*/", "");
const orig = readFileSync(file, "utf8");
const idx = orig.indexOf("/*|*/");
const before = orig.slice(0, idx).split("\n");
const pos = { line: before.length - 1, character: before[before.length - 1].length };
const exe = "/Users/arpit/Developer/flow-state/node_modules/@typescript/typescript-darwin-arm64/lib/tsc";
const p = spawn(exe, ["--lsp", "--stdio"], { cwd: here });
let buf = Buffer.alloc(0); const pending = new Map(); let id = 0;
p.stdout.on("data", (d) => {
  buf = Buffer.concat([buf, d]);
  for (;;) {
    const he = buf.indexOf("\r\n\r\n"); if (he < 0) return;
    const len = +/Content-Length: (\d+)/i.exec(buf.slice(0, he).toString())[1];
    if (buf.length < he + 4 + len) return;
    const msg = JSON.parse(buf.slice(he + 4, he + 4 + len).toString()); buf = buf.slice(he + 4 + len);
    if (msg.id !== undefined && msg.method) { send({ jsonrpc: "2.0", id: msg.id, result: null }); continue; }
    if (msg.id !== undefined && pending.has(msg.id)) pending.get(msg.id)(msg);
  }
});
function send(o) { const s = JSON.stringify(o); p.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); }
function req(method, params) { const i = ++id; return new Promise((r) => { pending.set(i, r); send({ jsonrpc: "2.0", id: i, method, params }); }); }
const note = (method, params) => send({ jsonrpc: "2.0", method, params });
const root = "file://" + here;
await req("initialize", { processId: process.pid, rootUri: root, capabilities: {}, workspaceFolders: [{ uri: root, name: "s" }] });
note("initialized", {});
const uri = "file://" + file;
note("textDocument/didOpen", { textDocument: { uri, languageId: "typescript", version: 1, text } });
await new Promise((r) => setTimeout(r, 1500));
const res = await req("textDocument/completion", { textDocument: { uri }, position: pos });
const items = Array.isArray(res.result) ? res.result : res.result?.items ?? [];
console.log(`completions at ${pos.line + 1}:${pos.character + 1}: ${items.length}`);
console.log(items.slice(0, 15).map((i) => i.label).join(", "));
p.kill();
