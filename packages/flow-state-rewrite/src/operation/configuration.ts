import { Predicate, Schema } from "effect";

export { firstConfigurationField } from "../internal/schema-issue.js";

type Callable = (...arguments_: never[]) => void;

export const CallableSchema = Schema.declare(
  // RETURN_TYPE: Preserves the Callable type predicate required to narrow decoded configuration.
  (value: unknown): value is Callable => Predicate.isFunction(value),
  { identifier: "Callable" },
);
