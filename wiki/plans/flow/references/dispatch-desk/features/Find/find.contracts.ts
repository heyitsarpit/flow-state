// One search, read one-off: the palette looks it up, it never subscribes (rule 41). Every input is in the key
// (rule 39): a query's answer is cached by workspace and text, so typing back to an earlier query is answered at once.
import { Schema } from "effect";
import { resource } from "flow-state";
import { FindApi, Hits } from "./find-api.js";

export const searchEverything = resource({
  id: "DispatchDesk/find",
  input: { workspaceId: Schema.String, q: Schema.String },
  output: Hits,
  key: ["workspaceId", "q"],
  lookup: (input, { signal }) => FindApi.use((api) => api.search(input, { signal })),
  staleTime: "30 seconds",
  gcTime: "2 minutes",
});
