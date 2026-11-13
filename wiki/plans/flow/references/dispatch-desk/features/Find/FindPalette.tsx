// The palette. Hits come from memory (the last answer delivered); "searching" is the one-off read's row, which is
// `undefined` before the first lookup and after a cancel (N3). A short query's reason comes from `check()`.
import { check } from "flow-state";
import { useActorByRef, useView } from "flow-state/react";
import { Find } from "./find.definition.js";
import { findRef } from "./find.ref.js";

const { E } = Find;

export function FindPalette({ workspaceId }: { workspaceId: string }) {
  const palette = useActorByRef(findRef(workspaceId), { input: { workspaceId } });
  const q = useView(palette, (s) => s.memory.q);
  const hits = useView(palette, (s) => s.memory.hits);
  const failed = useView(palette, (s) => s.memory.failed);
  const searching = useView(palette, (s) => s.operations.results?._tag === "Pending");
  const verdict = useView(palette, (s) => check(s, E.Search()));

  return (
    <div role="dialog" aria-label="Find">
      <input
        value={q}
        aria-label="Find"
        onChange={(event) => palette.send(E.Typed({ q: event.target.value }))}
        onKeyDown={(event) => event.key === "Enter" && palette.send(E.Search())}
      />
      {q !== "" && verdict._tag === "Denied" && verdict.reasons[0]?.code === "TooShort" && (
        <p className="hint">Type at least two letters</p>
      )}
      {searching && <p role="status">Searching…</p>}
      {failed && <p role="alert">Couldn't search. These are the last results.</p>}
      <ul style={{ opacity: failed ? 0.5 : 1 }}>
        {hits.map((hit) => (
          <li key={`${hit.kind}:${hit.id}`}>
            <button onClick={() => palette.send(E.Choose({ kind: hit.kind, id: hit.id }))}>
              {hit.kind}: {hit.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
