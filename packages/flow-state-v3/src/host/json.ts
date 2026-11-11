import { Schema } from "effect";

/**
 * Flow's records as the store holds them: JSON text, one codec both ways.
 */
const JsonText = Schema.fromJsonString(Schema.Json);

/**
 * A record's JSON data as text, for a store write.
 */
export const encodeJsonText = Schema.encodeUnknownSync(JsonText);

/**
 * A stored text as JSON data, `None` when it is not JSON.
 */
export const decodeJsonText = Schema.decodeUnknownOption(JsonText);
