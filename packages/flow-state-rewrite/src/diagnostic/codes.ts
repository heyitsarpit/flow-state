import { Schema } from "effect";

export const Code = Schema.Literals(["InvalidMachineConfiguration", "SchemaValidation", "Panic"]);

export type Code = typeof Code.Type;
