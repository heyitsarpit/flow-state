import { Formatter, Option, Predicate, Redactable } from "effect";

// FLOW_STATE_ALLOW_UNKNOWN: a printed value is any input, key or memory a trace or a Story shows.
type Value = unknown;

// An object or array being printed.
type Container = Readonly<Record<PropertyKey, Value>> | ReadonlyArray<Value>;

// How a container's entries are written: as JSON, or as a TypeScript literal for a printed Story.
type Style = "json" | "literal";

// A container being printed: its entries' texts so far, how to close it, and its entries to go.
type Frame = {
  readonly open: Container;
  readonly isArray: boolean;
  readonly entries: ReadonlyArray<readonly [string, Value]>;
  readonly parts: Array<string>;
  readonly done: (text: string) => void;
  next: number;
};

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/u;

// A leaf's text, or none for a value a JSON object leaves out (undefined, a function, a symbol).
const leafText = (value: Value) => {
  if (Predicate.isBigInt(value)) return Option.some(Formatter.formatJson(value));

  if (value === undefined || Predicate.isFunction(value) || Predicate.isSymbol(value))
    return Option.none<string>();

  return Option.some(Formatter.formatJson(value));
};

// FLOW_STATE_ALLOW_UNKNOWN: an object's own toJSON returns whatever it writes.
type ToJson = (key: string) => unknown;

// RETURN_TYPE: a type guard narrows to the `toJSON` JSON.stringify calls: a function of the key.
const isToJson = (
  // FLOW_STATE_ALLOW_UNKNOWN: any property's value, checked here.
  f: unknown,
): f is ToJson => Predicate.isFunction(f);

// What JSON writes for an object: its `toJSON`, an error's name and message beside its fields, or
// the object itself.
const shown = (value: Container, key: string) => {
  if (Predicate.hasProperty(value, "toJSON") && isToJson(value.toJSON)) return value.toJSON(key);

  return value instanceof Error
    ? { ...Object.fromEntries(Object.entries(value)), name: value.name, message: value.message }
    : value;
};

const keyOf = (key: string, style: Style) =>
  style === "literal" && IDENTIFIER.test(key) ? key : Formatter.formatJson(key);

const closeOf = (frame: Frame, style: Style) => {
  const inner = frame.parts.join(style === "literal" ? ", " : ",");

  if (frame.isArray) return `[${inner}]`;

  if (style === "json") return `{${inner}}`;

  return frame.parts.length === 0 ? "{}" : `{ ${inner} }`;
};

/**
 * A value printed as `Formatter.formatJson` prints it (`"json"`) or as a TypeScript literal for a
 * printed Story (`"literal"`), walked with its own stack, so a value of any depth prints. A value
 * met again on its own path is left out, as `formatJson` leaves a cycle out; a redactable value is
 * printed by `formatJson` itself.
 */
export const printValue = (root: Value, style: Style) => {
  const stack: Array<Frame> = [];
  const open = new Set<Container>();
  let result = "undefined";

  // Prints a value into its place: a leaf at once, a container by pushing its frame.
  const put = (raw: Value, key: string, place: (text: Option.Option<string>) => void) => {
    if (Predicate.hasProperty(raw, Redactable.symbolRedactable)) {
      place(Option.some(Formatter.formatJson(raw)));

      return;
    }

    const value = Predicate.isObjectOrArray(raw) && style === "json" ? shown(raw, key) : raw;

    if (!Predicate.isObjectOrArray(value) || Predicate.isFunction(value)) {
      place(leafText(value));

      return;
    }

    if (open.has(value)) {
      place(Option.none());

      return;
    }

    open.add(value);
    const isArray = Array.isArray(value);

    stack.push({
      open: value,
      isArray,
      entries: isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value),
      parts: [],
      done: (text) => place(Option.some(text)),
      next: 0,
    });
  };

  put(root, "", (text) => {
    result = Option.getOrElse(text, () => "undefined");
  });

  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
    if (frame.next === frame.entries.length) {
      stack.pop();
      open.delete(frame.open);
      frame.done(closeOf(frame, style));
    } else {
      const [key, value] = frame.entries[frame.next] ?? ["", undefined];
      const into = frame;

      frame.next += 1;
      put(value, key, (given) => {
        // A literal writes what JSON leaves out as `undefined`.
        const text = style === "literal" ? Option.orElseSome(given, () => "undefined") : given;

        if (into.isArray) into.parts.push(Option.getOrElse(text, () => "null"));
        else if (Option.isSome(text))
          into.parts.push(`${keyOf(key, style)}:${style === "literal" ? " " : ""}${text.value}`);
      });
    }
  }

  return result;
};
