export type Outcome = "pass" | "fail" | "unknown";
export type CoreItem =
  | { readonly kind: string; readonly name: string; readonly outcome: Outcome; readonly why: string; readonly detail?: unknown }
  | { readonly kind: string; readonly name: string; readonly note: string; readonly detail?: unknown };

export const MARK = "VERDICT ";
export const EXIT = { pass: 0, fail: 1, unknown: 2 } as const satisfies Record<Outcome, number>;
export const ALWAYS_JUDGED: readonly string[] = ["threw", "machine"];
export const MACHINE_ERRNOS: readonly string[] = ["EMFILE", "ENFILE", "ENOSPC", "EAGAIN", "ENOMEM", "EBUSY"];

export const outcomeOfCore = (items: readonly CoreItem[], kinds?: readonly string[]): Outcome => {
  const s = items.filter((i): i is Extract<CoreItem, { outcome: Outcome }> => "outcome" in i).filter((i) => kinds === undefined || kinds.includes(i.kind) || ALWAYS_JUDGED.includes(i.kind));
  if (s.length === 0 || s.some((i) => i.outcome === "fail")) return "fail";
  return s.some((i) => i.outcome === "unknown") ? "unknown" : "pass";
};

export const resourceErrno = (e: unknown, depth = 0): string | undefined => {
  if (e === null || typeof e !== "object" || depth > 4) return undefined;
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && MACHINE_ERRNOS.includes(code)) return code;
  const errors = (e as { errors?: unknown }).errors;
  if (Array.isArray(errors)) for (const x of errors) {
    const c = resourceErrno(x, depth + 1);
    if (c) return c;
  }
  return resourceErrno((e as { cause?: unknown }).cause, depth + 1);
};
