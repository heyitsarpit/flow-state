// Every function in a `Compiled` that is not a Slot's `run`, with its path. L4: `known` looks two levels down; this looks everywhere. Used by the typed path's check and flow check.
export const bareClosures = (c: unknown): string[] => {
  const out: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === "function") return void out.push(p);
    if (v === null || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    const o = v as Record<string, unknown>;
    if (typeof o["run"] === "function" && o["at"]) return;
    for (const k of Object.keys(o)) walk(o[k], p ? `${p}.${k}` : k);
  };
  walk(c, "");
  return out;
};
