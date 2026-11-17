import { Option, Predicate, Schema } from "effect";
import type { Compiled } from "./compiled.ts";

/**
 * The functions Flow derives from a declared Schema and holds on Compiled beside it: the Schema
 * determines them.
 */
export const DERIVED = new Set(["sameMemory", "is", "walk", "identity"]);

// FLOW_STATE_ALLOW_UNKNOWN: any part of a Compiled, or the plain data it shows.
type View = unknown;

// A part's own view when it is a leaf of the view, or none for a container whose children are
// viewed in turn.
const leafOf = (value: View) => {
  if (Schema.isSchema(value)) return Option.some<View>(Schema.toJsonSchemaDocument(value));

  if (Predicate.hasProperty(value, "slot") && Predicate.hasProperty(value, "run"))
    return Option.some<View>(value.slot);

  if (value instanceof Map || Array.isArray(value)) return Option.none<View>();

  return !Predicate.isObject(value) || Predicate.isFunction(value)
    ? Option.some<View>(value)
    : Option.none<View>();
};

// A container being viewed: its children, how its view is built from theirs, and their views so
// far.
type Frame = {
  readonly children: ReadonlyArray<View>;
  readonly build: (views: ReadonlyArray<View>) => View;
  readonly views: Array<View>;
};

// RETURN_TYPE: every branch is a container's frame.
const frameOf = (value: View): Frame => {
  if (value instanceof Map) {
    const keys = [...value.keys()];

    return {
      children: [...value.values()],
      build: (views) => keys.map((k, i) => [k, views[i]]),
      views: [],
    };
  }

  if (Array.isArray(value)) return { children: value, build: (views) => views, views: [] };

  const entries = Predicate.isObject(value)
    ? Object.entries(value).filter(([k]) => !DERIVED.has(k))
    : [];

  return {
    children: entries.map(([, v]) => v),
    build: (views) => Object.fromEntries(entries.map(([k], i) => [k, views[i]])),
    views: [],
  };
};

// The plain data a part of Compiled shows, built with its own stack, so a constant of any depth
// is viewed.
const viewOf = (root: View) => {
  const stack: Array<Frame> = [];
  let result: View = undefined;

  const place = (view: View) => {
    const parent = stack.at(-1);

    if (parent === undefined) result = view;
    else parent.views.push(view);
  };

  const enter = (value: View) =>
    Option.match(leafOf(value), {
      onSome: place,
      onNone: () => void stack.push(frameOf(value)),
    });

  enter(root);

  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1))
    if (frame.views.length < frame.children.length) enter(frame.children[frame.views.length]);
    else {
      stack.pop();
      place(frame.build(frame.views));
    }

  return result;
};

/**
 * A Compiled as plain data: each Slot by its name, each Schema by its JSON Schema document, maps
 * as entry lists, and the functions Flow derives from a Schema left out. Tools read this view; two
 * compiles of one source give equal views.
 */
export const dataView = (compiled: Compiled) => viewOf(compiled);
