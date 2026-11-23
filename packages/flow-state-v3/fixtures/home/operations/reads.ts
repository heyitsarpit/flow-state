import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { SensorsApi } from "../services.ts";

/**
 * A room's temperature, fresh for 30 seconds and dropped once no view shows it.
 */
export const readings = resource({
  id: "Home/readings",
  input: { room: Schema.String },
  key: ["room"],
  services: [SensorsApi],
  staleTime: "30 seconds",
  gcTime: 0,
  lookup: (input) => SensorsApi.use((api) => api.reading(input)),
});
