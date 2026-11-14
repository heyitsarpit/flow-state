import { describe, expect, test } from "bun:test";
import { REPO_ROOT } from "./block-shell-writes.ts";

const HOOK = new URL("./block-shell-writes.ts", import.meta.url).pathname;
const MESSAGE = "Write files with the Write or Edit tool, not the shell (project rule). Blocked: ";

interface Case {
  command: string;
  cwd?: string;
}

const BLOCKED: Case[] = [
  { command: "sed -i 's/foo/bar/' wiki/plans/flow/README.md" },
  { command: "sed -i.bak 's/a/b/' tools/process/notes.ts" },
  { command: "sed -i '' 's/a/b/' wiki/notes.md" },
  { command: "perl -pi -e 's/a/b/' packages/flow-state-v3/src/core.ts" },
  { command: "perl -i.bak -pe 's/a/b/' apps/docs/index.md" },
  { command: "echo hello > /Users/arpit/Developer/flow-state/wiki/notes.md" },
  { command: "printf 'x' >> wiki/log.md" },
  { command: "echo x >wiki/out.csv" },
  { command: "echo x 2>&1 > wiki/x.md" },
  { command: 'echo "x" > "wiki/quoted notes.md"' },
  { command: "cat > wiki/plans/flow/x.md <<'EOF'\n# hi\nEOF" },
  { command: "cat <<'EOF' > wiki/plans/flow/new.md\n# Title\nEOF" },
  { command: "cat <<EOF >> wiki/specs/core/new.spec\nnote\nEOF" },
  { command: "echo x | tee wiki/out.md" },
  {
    command: "cat <<EOF | tee -a /Users/arpit/Developer/flow-state/tools/process/out.txt\nhi\nEOF",
  },
  { command: "truncate -s 0 packages/flow-state-v3/conformance/data.json" },
  {
    command: "cp /private/tmp/claude-501/a.ts /Users/arpit/Developer/flow-state/tools/process/a.ts",
  },
  { command: "mv scratch.md wiki/specs/core/spec.md" },
  { command: "cd /Users/arpit/Developer/flow-state && echo x > a.ts", cwd: "/private/tmp/scratch" },
  { command: 'bash -c "echo x > /Users/arpit/Developer/flow-state/wiki/x.md"' },
  { command: "perl -e 'alarm 180; exec @ARGV' -- sed -i 's/a/b/' wiki/x.md" },
  { command: "find wiki -name '*.md' | xargs sed -i 's/a/b/'" },
  { command: "git commit -m \"$(cat <<'EOF'\nmsg\nEOF\n)\" && echo done > wiki/status.md" },
  // In-place edits are judged by their file, resolved through earlier assignments.
  {
    command:
      "cd /Users/arpit/Developer/flow-state && F=wiki/plans/x.md; perl -i -pe 's/a/b/' $F; sed -n 2p $F",
  },
  { command: "C=packages/flow-state-v3; sed -i '' -e 's/a/b/' $C/src/a.ts" },
  // Wrapper options that take a value.
  { command: "nice -n 10 sed -i s/a/b/ wiki/a.ts" },
  { command: "timeout -s KILL 5 tee wiki/a.md" },
  { command: "sudo -u root tee wiki/a.md" },
  { command: "printf x | xargs -I {} sed -i 's/a/b/' {}" },
  // ANSI-C quoting with an escaped quote.
  { command: "echo $'a\\'b' > wiki/a.ts" },
];

const ALLOWED: Case[] = [
  { command: "git commit -m \"$(cat <<'EOF'\nfix: handle x > y\n\nbody mentions sed -i\nEOF\n)\"" },
  { command: 'wk edit @task-1 --now --text "comment=moved a > b"' },
  { command: "nub run check" },
  { command: "bun tools/process/block-shell-writes.test.ts" },
  { command: "perl -e 'alarm 180; exec @ARGV' -- nub run test" },
  {
    command: "perl -e 'alarm 180; exec @ARGV' -- bun test tools/process/block-shell-writes.test.ts",
  },
  { command: 'grep -rn "sed -i" tools/' },
  { command: "sed -n '1,40p' wiki/plans/flow/README.md" },
  { command: "cat wiki/plans/flow/README.md" },
  { command: "echo x >&2" },
  { command: "nub run check 2>&1 | tail -20" },
  { command: "ls packages/ > /dev/null" },
  { command: "echo hi > /private/tmp/claude-501/scratch/x.md" },
  { command: "echo hi > /tmp/x.ts" },
  { command: "mkdir -p tools/process/fixtures" },
  { command: "rm /private/tmp/claude-501/scratch/tmp-output.txt" },
  { command: "cat <<'EOF' | wc -l\nline > x.ts\nEOF" },
  { command: "sed -n '/-i/p' wiki/notes.md" },
  { command: "cp /private/tmp/a.ts /tmp/b.ts" },
  { command: 'echo x > "$OUT_FILE"' },
  { command: "echo x > notes.txt", cwd: "/private/tmp/scratch" },
  { command: "perl -Ilib -e 'print 1'" },
  { command: "echo x > /dev/null 2>&1" },
  // In-place edits of scratch copies, as reviewers do for mutant probes.
  {
    command:
      "cd /private/tmp/claude-501/s/rv/packages/flow-state-v3 && perl -0pi -e 's/a/b/' conformance/parts/x.ts",
  },
  { command: "S=/private/tmp/claude-501/s; perl -pi -e 's/a/b/' $S/rv/a.ts" },
  { command: "D=/private/tmp/claude-501/s; C=$D/r/conformance; sed -i '' 's/a/b/' $C/turn/x.ts" },
  { command: "sed -i '' 's#a#b#' /private/tmp/claude-501/s/gates-b.sh && grep -n b gates-b.sh" },
  { command: "sed -i '' -e 's/a/b/' /dev/null; grep -n a wiki/x.ts" },
  // Real commands from this project's agents.
  {
    command:
      "perl -e 'alarm 60; exec @ARGV' -- wk edit @epic.V3 --now --text 'note=a > b, \"q\" >> c'",
  },
  {
    command:
      "perl -e 'alarm 290; exec @ARGV' -- nub run check </dev/null > /private/tmp/claude-501/x/check.txt 2>&1",
  },
  { command: "cd /Users/arpit/Developer/flow-state && git status --short | head" },
  { command: "rm /Users/arpit/Developer/flow-state/scratch-none" },
  { command: "jq -c '.' file.jsonl | head" },
  // Shell syntax where > is not a redirect.
  { command: "wk edit @t --now --text $'comment=don\\'t > stop'" },
  { command: "if (( n > 3 )); then echo big; fi" },
  { command: "[[ a > b ]] && echo yes" },
];

async function runHook(stdin: string): Promise<{ code: number; stderr: string }> {
  const proc = Bun.spawn([process.execPath, HOOK], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "pipe",
  });
  proc.stdin.write(stdin);
  proc.stdin.end();
  const stderr = await new Response(proc.stderr).text();
  return { code: await proc.exited, stderr };
}

const bashPayload = (c: Case) =>
  JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: c.command },
    cwd: c.cwd ?? REPO_ROOT,
  });

describe("blocks shell writes to project files", () => {
  for (const c of BLOCKED) {
    test(JSON.stringify(c.command), async () => {
      const { code, stderr } = await runHook(bashPayload(c));
      expect(code).toBe(2);
      expect(stderr).toContain(MESSAGE);
    });
  }
});

describe("allows everything else", () => {
  for (const c of ALLOWED) {
    test(JSON.stringify(c.command), async () => {
      const { code, stderr } = await runHook(bashPayload(c));
      expect(code).toBe(0);
      expect(stderr).toBe("");
    });
  }
});

describe("non-Bash and malformed input", () => {
  test("other tools are allowed even with shell-looking input", async () => {
    const payload = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: "wiki/x.md", content: "sed -i > wiki/x.md" },
      cwd: REPO_ROOT,
    });
    expect((await runHook(payload)).code).toBe(0);
  });

  test("malformed JSON is allowed", async () => {
    expect((await runHook("not json")).code).toBe(0);
  });
});
