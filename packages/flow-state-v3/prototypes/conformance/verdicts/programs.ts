export type ProgramOutput = { readonly stdout: string; readonly stderr: string; readonly exit: number | null };
export type TscDiagnostic = { readonly line: number; readonly code: string; readonly message: string };

export const tscDiagnostics = (p: ProgramOutput): readonly TscDiagnostic[] =>
  `${p.stdout}${p.stderr}`
    .split("\n")
    .map((l) => /^\S+\((\d+),\d+\): error (TS\d+): (.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ line: Number(m[1]), code: m[2]!, message: m[3]! }));

export const firstLines = (p: ProgramOutput, n: number): readonly string[] => `${p.stdout}${p.stderr}`.split("\n").filter(Boolean).slice(0, n);
