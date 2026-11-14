#!/usr/bin/env bun
// Claude Code PreToolUse hook: blocks Bash commands that write files inside REPO_ROOT.
// Input: one hook JSON object on stdin. Exit 2 with a reason on stderr blocks; exit 0 allows.
// Variables assigned earlier in the same command are resolved; targets that still cannot be resolved
// statically (other variables, command substitutions) are allowed. In-place edits are judged by their files.

import { homedir } from "node:os";
import { basename, isAbsolute, resolve } from "node:path";

export const REPO_ROOT = "/Users/arpit/Developer/flow-state";

const CODE_FILE = /\.(ts|md|task|spec|plan|json|csv)$/;
const WRITE_OPS = new Set([">", ">>", ">|", "&>", "&>>", ">&"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const PREFIX_WORDS = new Set(["!", "{", "}", "do", "then", "else", "elif", "if", "while", "until"]);
// Wrappers that run the rest of their words as a command, with the options that take a separate value.
const WRAPPERS = new Map<string, Set<string>>([
  ["env", new Set(["-u", "-C", "-S", "--unset", "--chdir"])],
  ["command", new Set()],
  ["exec", new Set(["-a"])],
  ["nohup", new Set()],
  ["time", new Set()],
  ["builtin", new Set()],
  ["xargs", new Set(["-I", "-n", "-P", "-L", "-s", "-d", "-E", "-a", "-J", "-R", "-S"])],
  ["sudo", new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "-T"])],
  ["nice", new Set(["-n", "--adjustment"])],
  ["timeout", new Set(["-s", "-k", "--signal", "--kill-after"])],
]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

type Redir = { kind: "redir"; op: string; target: string | null };
type Token = { kind: "word"; text: string } | { kind: "sep" } | Redir;
type Simple = { words: string[]; redirects: Redir[]; heredoc: boolean };
type Vars = Map<string, string>;
interface Lexed {
  tokens: Token[];
  next: number;
}

// Splits shell text into tokens. Quoted text is literal. $(...), `...` and <(...) bodies are
// lexed into their own token lists (pushed to subs). Heredoc bodies are skipped.
function lex(src: string, start: number, nested: boolean, subs: Token[][]): Lexed {
  const tokens: Token[] = [];
  const heredocs: { redir: Redir; dash: boolean }[] = [];
  const word = { active: false, text: "" };
  let pending: Redir | null = null;
  let depth = 0;
  let i = start;

  const add = (text: string) => {
    word.active = true;
    word.text += text;
  };
  const flush = () => {
    if (!word.active) return;
    const text = word.text;
    word.active = false;
    word.text = "";
    if (pending !== null) pending.target = text;
    else tokens.push({ kind: "word", text });
    pending = null;
  };
  const sep = () => {
    flush();
    pending = null;
    tokens.push({ kind: "sep" });
  };
  const redirect = (op: string): Redir => {
    if (!/^\d+$/.test(word.text)) flush();
    word.active = false;
    word.text = "";
    const tok: Redir = { kind: "redir", op, target: null };
    tokens.push(tok);
    pending = tok;
    return tok;
  };
  const backtick = (at: number): number => {
    const close = src.indexOf("`", at + 1);
    const end = close < 0 ? src.length : close;
    subs.push(lex(src.slice(at + 1, end), 0, false, subs).tokens);
    add("``");
    return end + 1;
  };
  const doubleQuoted = (at: number): number => {
    word.active = true;
    let j = at + 1;
    while (j < src.length && src.charAt(j) !== '"') {
      const ch = src.charAt(j);
      if (ch === "\\") {
        const next = src.charAt(j + 1);
        if ('$`"\\'.includes(next)) add(next);
        else if (next !== "\n") add(`\\${next}`);
        j += 2;
      } else if (src.startsWith("$((", j)) {
        const close = src.indexOf("))", j);
        add("$(())");
        j = close < 0 ? src.length : close + 2;
      } else if (src.startsWith("$(", j)) {
        const sub = lex(src, j + 2, true, subs);
        subs.push(sub.tokens);
        add("$()");
        j = sub.next + 1;
      } else if (ch === "`") {
        j = backtick(j);
      } else {
        add(ch);
        j++;
      }
    }
    return j + 1;
  };

  while (i < src.length) {
    const c = src.charAt(i);
    const n = src.charAt(i + 1);
    if (c === " " || c === "\t") {
      flush();
      i++;
    } else if (c === "\n") {
      sep();
      i++;
      for (const h of heredocs.splice(0)) {
        if (h.redir.target !== null) i = skipBody(src, i, h.redir.target, h.dash);
      }
    } else if (c === "#" && !word.active) {
      while (i < src.length && src.charAt(i) !== "\n") i++;
    } else if (c === "\\") {
      if (n !== "\n") add(n);
      i += 2;
    } else if (c === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close < 0 ? src.length : close;
      add(src.slice(i + 1, end));
      i = end + 1;
    } else if (c === '"') {
      i = doubleQuoted(i);
    } else if (c === "$" && n === "'") {
      let j = i + 2;
      while (j < src.length && src.charAt(j) !== "'") {
        add(src.charAt(j) === "\\" ? src.charAt(j + 1) : src.charAt(j));
        j += src.charAt(j) === "\\" ? 2 : 1;
      }
      word.active = true;
      i = j + 1;
    } else if (c === "(" && n === "(" && !word.active) {
      const close = src.indexOf("))", i);
      add("(())");
      i = close < 0 ? src.length : close + 2;
    } else if (src.startsWith("$((", i)) {
      const close = src.indexOf("))", i);
      add("$(())");
      i = close < 0 ? src.length : close + 2;
    } else if (src.startsWith("$(", i)) {
      const sub = lex(src, i + 2, true, subs);
      subs.push(sub.tokens);
      add("$()");
      i = sub.next + 1;
    } else if (c === "`") {
      i = backtick(i);
    } else if ((c === "<" || c === ">") && n === "(") {
      flush();
      const sub = lex(src, i + 2, true, subs);
      subs.push(sub.tokens);
      add("(proc)");
      i = sub.next + 1;
    } else if (c === ">") {
      const op = n === ">" ? ">>" : n === "|" ? ">|" : n === "&" ? ">&" : ">";
      redirect(op);
      i += op.length;
    } else if (c === "<") {
      if (src.startsWith("<<<", i)) {
        redirect("<<<");
        i += 3;
      } else if (src.startsWith("<<", i)) {
        const dash = src.charAt(i + 2) === "-";
        const op = dash ? "<<-" : "<<";
        heredocs.push({ redir: redirect(op), dash });
        i += op.length;
      } else {
        redirect("<");
        i++;
      }
    } else if (c === "&" && n === ">") {
      const op = src.charAt(i + 2) === ">" ? "&>>" : "&>";
      redirect(op);
      i += op.length;
    } else if (c === "&" || c === "|" || c === ";") {
      sep();
      i += n === c || (c !== ";" && n === "&") ? 2 : 1;
    } else if (c === "(") {
      sep();
      depth++;
      i++;
    } else if (c === ")") {
      if (nested && depth === 0) {
        flush();
        return { tokens, next: i };
      }
      depth = Math.max(0, depth - 1);
      sep();
      i++;
    } else {
      add(c);
      i++;
    }
  }
  flush();
  return { tokens, next: i };
}

// Returns the index of the line that closes a heredoc (its newline, or end of input).
function skipBody(src: string, from: number, delim: string, dash: boolean): number {
  let i = from;
  for (;;) {
    const eol = src.indexOf("\n", i);
    const end = eol < 0 ? src.length : eol;
    const line = dash ? src.slice(i, end).replace(/^\t+/, "") : src.slice(i, end);
    if (line === delim || eol < 0) return end;
    i = eol + 1;
  }
}

function simpleCommands(tokens: Token[]): Simple[] {
  const out: Simple[] = [];
  let cur: Simple = { words: [], redirects: [], heredoc: false };
  const end = () => {
    if (cur.words.length + cur.redirects.length > 0) out.push(cur);
    cur = { words: [], redirects: [], heredoc: false };
  };
  for (const t of tokens) {
    if (t.kind === "word") cur.words.push(t.text);
    else if (t.kind === "redir") {
      cur.redirects.push(t);
      if (t.op === "<<" || t.op === "<<-") cur.heredoc = true;
    } else end();
  }
  end();
  return out;
}

function stripPrefix(words: string[]): string[] {
  let k = 0;
  while (k < words.length && (ASSIGNMENT.test(words[k] ?? "") || PREFIX_WORDS.has(words[k] ?? "")))
    k++;
  return words.slice(k);
}

const isOption = (a: string) => a.startsWith("-");

// Arguments that are not options; everything after "--" counts as an operand.
function operands(args: string[]): string[] {
  const out: string[] = [];
  let literal = false;
  for (const a of args) {
    if (literal) out.push(a);
    else if (a === "--") literal = true;
    else if (!isOption(a)) out.push(a);
  }
  return out;
}

// Option words before "--".
function options(args: string[]): string[] {
  const end = args.indexOf("--");
  return (end < 0 ? args : args.slice(0, end)).filter(isOption);
}

const sedInPlace = (a: string) =>
  /^-[nErsuzb]*i/.test(a) || a === "--in-place" || a.startsWith("--in-place=");
const perlInPlace = (a: string) => /^-[lpnastcwWTuUvX0-9]*i/.test(a);

// The files sed edits: its operands minus the script, which is the first operand unless -e or -f gave it.
function sedFiles(args: string[]): string[] {
  const words: string[] = [];
  let scripted = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k] ?? "";
    if (a === "--") {
      words.push(...args.slice(k + 1));
      break;
    }
    if (a.startsWith("--expression=") || a.startsWith("--file=")) scripted = true;
    else if (a === "--expression" || a === "--file" || /^-[nErsuz]*[ef]$/.test(a)) {
      scripted = true;
      k++;
    } else if (
      /^-[nErsuz]*i$/.test(a) &&
      (args[k + 1] === "" || /^\.[\w.~-]*$/.test(args[k + 1] ?? ""))
    ) {
      k++; // BSD sed: -i '' or -i .bak takes the suffix as its own word
    } else if (!isOption(a)) words.push(a);
  }
  return scripted ? words : words.slice(1);
}

// The files perl edits: its operands minus the program file, which is the first operand unless -e or -E gave code.
function perlFiles(args: string[]): string[] {
  const words: string[] = [];
  let scripted = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k] ?? "";
    if (a === "--") {
      words.push(...args.slice(k + 1));
      break;
    }
    if (!isOption(a)) {
      words.push(a);
      continue;
    }
    for (let p = 1; p < a.length; p++) {
      const c = a.charAt(p);
      const attached = a.slice(p + 1);
      if (c === "e" || c === "E") scripted = true;
      if ("eEIMm".includes(c)) {
        if (attached === "") k++;
        break;
      }
      if ("ixdDC".includes(c)) break;
      if (c === "0" || c === "l") p += /^(?:x[0-9a-fA-F]*|[0-7]*)/.exec(attached)?.[0].length ?? 0;
    }
  }
  return scripted ? words : words.slice(1);
}

function inPlaceReason(
  tool: string,
  files: string[],
  cwd: string | null,
  vars: Vars,
): string | null {
  // No file operand (files come from xargs or stdin): judge by the directory it runs in.
  if (files.length === 0)
    return cwd !== null && isProjectFile(cwd) ? `${tool} -i edits files in place` : null;
  const path = firstProjectFile(files, cwd, vars, false);
  return path === null ? null : `${tool} -i edits ${path} in place`;
}

const isExempt = (p: string) =>
  p === "/dev/null" || p === "/tmp" || p.startsWith("/tmp/") || p.startsWith("/private/tmp/");
const isProjectFile = (p: string) =>
  (p === REPO_ROOT || p.startsWith(`${REPO_ROOT}/`)) && !isExempt(p);

// Absolute path of a redirect or file operand, or null when it cannot be known statically.
function resolveTarget(text: string, cwd: string | null, vars: Vars): string | null {
  if (text === "") return null;
  const home = homedir();
  const t = expand(text === "~" || text.startsWith("~/") ? home + text.slice(1) : text, cwd, vars);
  if (/[$`]/.test(t)) return null;
  if (isAbsolute(t)) return resolve(t);
  return cwd === null ? null : resolve(cwd, t);
}

// Replaces $NAME and ${NAME} known statically: HOME, PWD and earlier assignments in the command.
function expand(text: string, cwd: string | null, vars: Vars): string {
  return text.replace(
    /\$\{(\w+)\}|\$(\w+)/g,
    (ref, braced: string | undefined, bare: string | undefined) => {
      const name = braced ?? bare ?? "";
      if (name === "HOME") return homedir();
      if (name === "PWD" && cwd !== null) return cwd;
      return vars.get(name) ?? ref;
    },
  );
}

function firstProjectFile(
  names: string[],
  cwd: string | null,
  vars: Vars,
  codeOnly: boolean,
): string | null {
  for (const name of names) {
    const path = resolveTarget(name, cwd, vars);
    if (path !== null && isProjectFile(path) && (!codeOnly || CODE_FILE.test(path))) return path;
  }
  return null;
}

function redirectReason(
  redirects: Redir[],
  cwd: string | null,
  vars: Vars,
  heredoc: boolean,
): string | null {
  for (const r of redirects) {
    if (r.target === null || !WRITE_OPS.has(r.op)) continue;
    if (r.op === ">&" && /^(\d+|-)$/.test(r.target)) continue;
    const path = resolveTarget(r.target, cwd, vars);
    if (path !== null && isProjectFile(path))
      return `${heredoc ? "heredoc " : ""}redirect into ${path}`;
  }
  return null;
}

function checkCommand(
  words: string[],
  cwd: string | null,
  vars: Vars,
  redirects: Redir[],
  heredoc: boolean,
): string | null {
  const argv = stripPrefix(words);
  // Inside [[ ]], > compares strings.
  if (argv[0] === "[[") return null;
  const redirected = redirectReason(redirects, cwd, vars, heredoc);
  if (redirected !== null) return redirected;
  const first = argv[0];
  if (first === undefined) return null;
  const name = basename(first);
  const args = argv.slice(1);

  if (name === "sed" && options(args).some(sedInPlace)) {
    const reason = inPlaceReason("sed", sedFiles(args), cwd, vars);
    if (reason !== null) return reason;
  }
  if (name === "perl" && options(args).some(perlInPlace)) {
    const reason = inPlaceReason("perl", perlFiles(args), cwd, vars);
    if (reason !== null) return reason;
  }
  if (name === "tee") {
    const path = firstProjectFile(operands(args), cwd, vars, false);
    if (path !== null) return `tee into ${path}`;
  }
  if (name === "truncate" || name === "cp" || name === "mv") {
    const files = operands(args);
    const targets = name === "truncate" ? files : files.length > 1 ? files.slice(-1) : [];
    const path = firstProjectFile(targets, cwd, vars, true);
    if (path !== null) return `${name} into ${path}`;
  }
  if (name === "eval") return findViolation(args.join(" "), cwd);
  if (SHELLS.has(name)) {
    const c = args.indexOf("-c");
    const script = args[c + 1];
    return c >= 0 && script !== undefined ? findViolation(script, cwd) : null;
  }
  if (name === "perl" && args.includes("--")) {
    return checkCommand(args.slice(args.indexOf("--") + 1), cwd, vars, [], false);
  }
  if (name === "find") {
    const start = args.findIndex((a) => a === "-exec" || a === "-execdir");
    if (start >= 0) {
      const stop = args.findIndex((a, k) => k > start && (a === ";" || a === "+"));
      return checkCommand(args.slice(start + 1, stop < 0 ? undefined : stop), cwd, vars, [], false);
    }
  }
  const valued = WRAPPERS.get(name);
  if (valued !== undefined) {
    let rest = args;
    while (rest.length > 0 && (isOption(rest[0] ?? "") || ASSIGNMENT.test(rest[0] ?? ""))) {
      rest = rest.slice(valued.has(rest[0] ?? "") ? 2 : 1);
    }
    if (name === "timeout") rest = rest.slice(1);
    return checkCommand(rest, cwd, vars, [], false);
  }
  return null;
}

// Directory after a cd or pushd; null when it cannot be known.
function changeDir(words: string[], cwd: string | null, vars: Vars): string | null {
  const argv = stripPrefix(words);
  const first = argv[0];
  if (first === undefined || !["cd", "pushd"].includes(basename(first))) return cwd;
  const args = argv.slice(1);
  const dir = operands(args)[0];
  if (dir === undefined) return args.length > 0 ? null : homedir();
  return resolveTarget(dir, cwd, vars);
}

// Records NAME=value from a command made only of assignments (optionally after export).
function assign(words: string[], cwd: string | null, vars: Vars): void {
  const list = words[0] === "export" ? words.slice(1) : words;
  if (list.length === 0 || !list.every((w) => ASSIGNMENT.test(w))) return;
  for (const w of list) {
    const at = w.indexOf("=");
    vars.set(w.slice(0, at), expand(w.slice(at + 1), cwd, vars));
  }
}

function checkTokens(tokens: Token[], cwd: string | null): string | null {
  let dir = cwd;
  const vars: Vars = new Map();
  for (const cmd of simpleCommands(tokens)) {
    const reason = checkCommand(cmd.words, dir, vars, cmd.redirects, cmd.heredoc);
    if (reason !== null) return reason;
    assign(cmd.words, dir, vars);
    dir = changeDir(cmd.words, dir, vars);
  }
  return null;
}

// The reason a shell command text writes a project file, or null when it does not.
export function findViolation(text: string, cwd: string | null): string | null {
  const subs: Token[][] = [];
  const top = lex(text, 0, false, subs).tokens;
  for (const tokens of [top, ...subs]) {
    const reason = checkTokens(tokens, cwd);
    if (reason !== null) return reason;
  }
  return null;
}

// The reason a hook payload should be blocked, or null to allow.
export function decide(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as { tool_name?: unknown; tool_input?: unknown; cwd?: unknown };
  if (record.tool_name !== "Bash") return null;
  const input = record.tool_input as { command?: unknown } | null | undefined;
  const command = input?.command;
  if (typeof command !== "string") return null;
  return findViolation(command, typeof record.cwd === "string" ? record.cwd : REPO_ROOT);
}

if (import.meta.main) {
  let payload: unknown = null;
  try {
    payload = JSON.parse(await Bun.stdin.text());
  } catch {
    payload = null;
  }
  const reason = decide(payload);
  if (reason !== null) {
    const rule = "Write files with the Write or Edit tool, not the shell (project rule).";
    process.stderr.write(`${rule} Blocked: ${reason}.\n`);
    process.exit(2);
  }
}
