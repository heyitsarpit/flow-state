export type Outcome = "pass" | "fail" | "unknown";
export type CoreItem =
  | { readonly kind: string; readonly name: string; readonly outcome: Outcome; readonly why: string; readonly detail?: unknown }
  | { readonly kind: string; readonly name: string; readonly note: string; readonly detail?: unknown };

export const MARK = "VERDICT ";
export const EXIT = { pass: 0, fail: 1, unknown: 2 } as const satisfies Record<Outcome, number>;
export const ALWAYS_JUDGED: readonly string[] = ["threw", "machine", "work-bound"];
export const MACHINE_ERRNOS: readonly string[] = ["EMFILE", "ENFILE", "ENOSPC", "EAGAIN", "ENOMEM", "EBUSY", "ENOBUFS", "EADDRNOTAVAIL", "ETXTBSY", "EDQUOT", "ERR_OUT_OF_MEMORY", "ERR_WORKER_OUT_OF_MEMORY", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"];
export const WORK_BOUND = "harness: did not quiesce in";

export const outcomeOfCore = (items: readonly CoreItem[], kinds?: readonly string[]): Outcome => {
  const s = items.filter((i): i is Extract<CoreItem, { outcome: Outcome }> => "outcome" in i).filter((i) => kinds === undefined || kinds.includes(i.kind) || ALWAYS_JUDGED.includes(i.kind));
  if (s.some((i) => i.outcome === "fail")) return "fail";
  if (s.length === 0 || s.some((i) => i.outcome === "unknown")) return "unknown";
  return "pass";
};

export const resourceErrno = (e: unknown, seen: Set<object> = new Set()): string | undefined => {
  if (e === null || typeof e !== "object" || seen.has(e)) return undefined;
  seen.add(e);
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string" && MACHINE_ERRNOS.includes(code)) return code;
  if (e instanceof RangeError && /out of memory/i.test(e.message)) return "ERR_OUT_OF_MEMORY";
  const named = /\b(EMFILE|ENFILE|ENOSPC|ENOMEM|EAGAIN|ENOBUFS|EDQUOT)\b/.exec(String((e as { message?: unknown }).message ?? ""));
  if (named && (e as { name?: unknown }).name === "ResolveMessage") return named[1];
  const errors = (e as { errors?: unknown }).errors;
  if (Array.isArray(errors))
    for (const x of errors) {
      const c = resourceErrno(x, seen);
      if (c) return c;
    }
  return resourceErrno((e as { cause?: unknown }).cause, seen);
};
