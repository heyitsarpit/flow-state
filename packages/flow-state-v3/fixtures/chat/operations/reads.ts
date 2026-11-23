import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { HistoryApi } from "../services.ts";

/**
 * A thread's messages. A thread opened again within 30 seconds shows what was read; one nobody has
 * open is kept for five minutes.
 */
export const history = resource({
  id: "Chat/history",
  input: { thread: Schema.String },
  key: ["thread"],
  services: [HistoryApi],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  lookup: (input) => HistoryApi.use((api) => api.history(input)),
});
