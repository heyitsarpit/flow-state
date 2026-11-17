import { Option, Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * A folder in a tree of folders: its sub-folders, or a note in their place.
 */
export type Folder = { readonly kids: ReadonlyArray<Folder | string> };

/**
 * A folder tree's Schema: a recursive `Schema.suspend`.
 */
// RETURN_TYPE: a recursive Schema names its own type.
export const Folder: Schema.Codec<Folder> = Schema.Struct({
  kids: Schema.Array(Schema.Union([Schema.String, Schema.suspend(() => Folder)])),
});

/**
 * An index of names, each holding the index below it.
 */
export type Index = ReadonlyMap<string, Index | string>;

/**
 * An index's Schema: Maps nested under a recursive `Schema.suspend`.
 */
// RETURN_TYPE: a recursive Schema names its own type.
export const Index: Schema.Codec<Index> = Schema.ReadonlyMap(
  Schema.String,
  Schema.Union([Schema.String, Schema.suspend(() => Index)]),
);

// Lists `depth` deep, the innermost holding a note: `depth` nested containers in all.
const listOf = (depth: number) => {
  let doc: Schema.Json = "note";

  for (let n = 0; n < depth; n += 1) doc = [doc];

  return doc;
};

/**
 * Folders `depth` containers deep: each folder and its list of kids is two, the innermost list
 * holds a note, and an odd depth ends in a folder with no kids.
 */
export const foldersOf = (depth: number) => {
  let tree: Folder = depth % 2 === 0 ? { kids: ["note"] } : { kids: [] };

  for (let n = depth % 2 === 0 ? 2 : 1; n < depth; n += 2) tree = { kids: [tree] };

  return tree;
};

// The index a nest of lists reads as: a Map for each list, the innermost holding the note.
const indexOf = (lists: Schema.Json) => {
  let depth = 0;

  for (let at = lists; Array.isArray(at); at = at[0] ?? null) depth += 1;

  let index: Index = new Map([["name", "note"]]);

  for (let n = 1; n < depth; n += 1) index = new Map([["name", index]]);

  return depth === 0 ? new Map<string, Index | string>() : index;
};

/**
 * An index `depth` Maps deep, built directly, its innermost Map naming `leaf`.
 */
export const treeOf = (depth: number, leaf = "note") => {
  let index: Index = new Map([["name", leaf]]);

  for (let n = 1; n < depth; n += 1) index = new Map([["name", index]]);

  return depth === 0 ? new Map<string, Index | string>() : index;
};

// A node's Schema type: its encoded kids are the encoded nodes below.
// FLOW_STATE_ALLOW_UNKNOWN: a node's encoded children, typed by the class itself.
type NodeCodec = Schema.Codec<Node, { readonly kids: ReadonlyArray<unknown> }>;

/**
 * A node of an outline kept as class instances: its children.
 */
export class Node extends Schema.Class<Node>("Workspace/Node")({
  kids: Schema.Array(Schema.suspend(() => nodeSchema())),
}) {}

// RETURN_TYPE: a recursive class names its own Schema type.
const nodeSchema = (): NodeCodec => Node;

/**
 * A chain of nodes `depth` deep.
 */
export const nodesOf = (depth: number) => {
  let node = new Node({ kids: [] });

  for (let n = 1; n < depth; n += 1) node = new Node({ kids: [node] });

  return node;
};

/**
 * The value kinds a Schema makes beside plain data, each holding a folder tree `depth` deep: an
 * Option, a class instance chain, a Set and a Map keyed by trees.
 */
export const kindsOf = (depth: number) => ({
  boxed: Option.some(foldersOf(depth)),
  node: nodesOf(depth),
  bag: new Set([foldersOf(depth), foldersOf(2)]),
  keyed: new Map([[foldersOf(depth), "deep"]]),
});

/**
 * The workspace's nested things, each as deep as a paste or an import made it: an outline as
 * plain JSON lists, a folder tree under a recursive Schema, and the lists an index of Maps is read
 * from, an index of Maps itself, and a folder tree an import brings whole in its event; and a title
 * beside them. Kept across reloads.
 */
export const Nests = definition({
  id: "Workspace/Nests",
  persist: true,
  states: ["OPEN"],
  events: {
    Lists: { depth: Schema.Number },
    Folders: { depth: Schema.Number },
    Maps: { depth: Schema.Number },
    Title: { title: Schema.String },
    Tree: { depth: Schema.Number },
    Kinds: { depth: Schema.Number },
    Import: { folder: Folder },
  },
  memory: {
    lists: Flow.initial(Schema.Json, null),
    folders: Flow.initial(Folder, { kids: [] }),
    index: Flow.initial(Schema.Json, null),
    tree: Flow.initial(Index, new Map<string, Index | string>()),
    boxed: Flow.initial(Schema.Option(Folder), Option.none()),
    node: Flow.initial(Node, new Node({ kids: [] })),
    bag: Flow.initial(Schema.ReadonlySet(Folder), new Set<Folder>()),
    keyed: Flow.initial(Schema.ReadonlyMap(Folder, Schema.String), new Map<Folder, string>()),
    title: Flow.initial(Schema.String, ""),
  },
});

/**
 * The nests: each event builds its nest that deep, or names the title.
 */
export const NestsMachine = machine(Nests, ({ S }) => ({
  default: S.OPEN,
  on: {
    Lists: { updateMemory: ({ event }) => ({ lists: listOf(event.depth) }) },
    Folders: { updateMemory: ({ event }) => ({ folders: foldersOf(event.depth) }) },
    Maps: { updateMemory: ({ event }) => ({ index: listOf(event.depth) }) },
    Title: { updateMemory: ({ event }) => ({ title: event.title }) },
    Tree: { updateMemory: ({ event }) => ({ tree: treeOf(event.depth) }) },
    Kinds: { updateMemory: ({ event }) => kindsOf(event.depth) },
    Import: { updateMemory: ({ event }) => ({ folders: event.folder }) },
  },
}));

/**
 * The nests' viewer: it reads each nest and the title, and counts each change of a nest it hears;
 * it pins a folder tree of its own, and hears the title beside its pin. Kept across reloads.
 */
export const NestView = definition({
  id: "Workspace/NestView",
  persist: true,
  states: ["SHOWN"],
  events: { Pin: { depth: Schema.Number } },
  internalEvents: {
    ListsHeard: {},
    FoldersHeard: {},
    MapsHeard: {},
    TreesHeard: {},
    KindsHeard: {},
    PinHeard: {},
  },
  memory: {
    lists: Flow.initial(Schema.Number, 0),
    folders: Flow.initial(Schema.Number, 0),
    maps: Flow.initial(Schema.Number, 0),
    trees: Flow.initial(Schema.Number, 0),
    kinds: Flow.initial(Schema.Number, 0),
    pins: Flow.initial(Schema.Number, 0),
    pinned: Flow.initial(Folder, { kids: [] }),
  },
  context: {
    lists: Nests.Provider.select(Schema.Json, (n) => n.memory.lists),
    folders: Nests.Provider.select(Folder, (n) => n.memory.folders),
    maps: Nests.Provider.select(Index, (n) => indexOf(n.memory.index)),
    title: Nests.Provider.select(Schema.String, (n) => n.memory.title),
    tree: Nests.Provider.select(Index, (n) => n.memory.tree),
    boxed: Nests.Provider.select(Schema.Option(Folder), (n) => n.memory.boxed),
  },
});

/**
 * The viewer: each changed nest is one more heard of its kind; a changed title alone is heard by
 * none of them, but by the pin's reaction, which reads the title beside its own pinned tree.
 */
export const NestViewMachine = machine(NestView, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    { select: ({ context }) => context.lists, event: E.ListsHeard },
    { select: ({ context }) => context.folders, event: E.FoldersHeard },
    { select: ({ context }) => context.maps, event: E.MapsHeard },
    { select: ({ context }) => context.tree, event: E.TreesHeard },
    { select: ({ context }) => context.boxed, event: E.KindsHeard },
    {
      select: ({ context, memory }) => ({ title: context.title, pinned: memory.pinned }),
      event: E.PinHeard,
    },
  ],
  on: {
    Pin: { updateMemory: ({ event }) => ({ pinned: foldersOf(event.depth) }) },
    ListsHeard: { updateMemory: ({ memory }) => ({ lists: memory.lists + 1 }) },
    FoldersHeard: { updateMemory: ({ memory }) => ({ folders: memory.folders + 1 }) },
    MapsHeard: { updateMemory: ({ memory }) => ({ maps: memory.maps + 1 }) },
    TreesHeard: { updateMemory: ({ memory }) => ({ trees: memory.trees + 1 }) },
    KindsHeard: { updateMemory: ({ memory }) => ({ kinds: memory.kinds + 1 }) },
    PinHeard: { updateMemory: ({ memory }) => ({ pins: memory.pins + 1 }) },
  },
}));
