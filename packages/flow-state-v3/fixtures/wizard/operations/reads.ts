import { Schema } from "effect";
import { resource } from "../../../src/index.ts";
import { BookingApi, Postcode } from "../services.ts";

/**
 * The area a postcode is in. Areas rarely change, so an answer is fresh for an hour.
 */
export const area = resource({
  id: "Wizard/area",
  input: { postcode: Postcode },
  key: ["postcode"],
  services: [BookingApi],
  staleTime: "1 hour",
  gcTime: "1 hour",
  lookup: (input) => BookingApi.use((api) => api.area(input)),
});

/**
 * A day's open inspection slots in an area, read fresh each time: others book them all day.
 */
export const slots = resource({
  id: "Wizard/slots",
  input: { area: Schema.String, day: Schema.String },
  key: ["area", "day"],
  services: [BookingApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => BookingApi.use((api) => api.slots(input)),
});
