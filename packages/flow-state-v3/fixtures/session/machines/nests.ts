import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";

/**
 * A folder in a tree of folders: its sub-folders, or a note in their place.
 */
export type Folder = { readonly kids: ReadonlyArray<Folder | string> };

// RETURN_TYPE: a recursive Schema names its own type.
const Folder: Schema.Codec<Folder> = Schema.Struct({
  kids: Schema.Array(Schema.Union([Schema.String, Schema.suspend(() => Folder)])),
});

/**
 * An index of names, each holding the index below it.
 */
export type Index = ReadonlyMap<string, Index | string>;

// RETURN_TYPE: a recursive Schema names its own type.
const Index: Schema.Codec<Index> = Schema.ReadonlyMap(
  Schema.String,
  Schema.Union([Schema.String, Schema.suspend(() => Index)]),
);

// Lists `depth` deep, the innermost holding a note: `depth` nested containers in all.
const listOf = (depth: number) => {
  let doc: Schema.Json = "note";

  for (let n = 0; n < depth; n += 1) doc = [doc];

  return doc;
};

// Folders `depth` containers deep: each folder and its list of kids is two, the innermost list
// holds a note, and an odd depth ends in a folder with no kids.
const foldersOf = (depth: number) => {
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
 * The workspace's nested things, each as deep as a paste or an import made it: an outline as
 * plain JSON lists, a folder tree under a recursive Schema, and the lists an index of Maps is read
 * from; and a title beside them. Kept across reloads.
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
  },
  memory: {
    lists: Flow.initial(Schema.Json, null),
    folders: Flow.initial(Folder, { kids: [] }),
    index: Flow.initial(Schema.Json, null),
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
  },
}));

/**
 * The nests' viewer: it reads each nest and the title, and counts each change of a nest it hears;
 * kept across reloads.
 */
export const NestView = definition({
  id: "Workspace/NestView",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { ListsHeard: {}, FoldersHeard: {}, MapsHeard: {} },
  memory: {
    lists: Flow.initial(Schema.Number, 0),
    folders: Flow.initial(Schema.Number, 0),
    maps: Flow.initial(Schema.Number, 0),
  },
  context: {
    lists: Nests.Provider.select(Schema.Json, (n) => n.memory.lists),
    folders: Nests.Provider.select(Folder, (n) => n.memory.folders),
    maps: Nests.Provider.select(Index, (n) => indexOf(n.memory.index)),
    title: Nests.Provider.select(Schema.String, (n) => n.memory.title),
  },
});

/**
 * The viewer: each changed nest is one more heard of its kind; a changed title alone is heard by
 * none.
 */
export const NestViewMachine = machine(NestView, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    { select: ({ context }) => context.lists, event: E.ListsHeard },
    { select: ({ context }) => context.folders, event: E.FoldersHeard },
    { select: ({ context }) => context.maps, event: E.MapsHeard },
  ],
  on: {
    ListsHeard: { updateMemory: ({ memory }) => ({ lists: memory.lists + 1 }) },
    FoldersHeard: { updateMemory: ({ memory }) => ({ folders: memory.folders + 1 }) },
    MapsHeard: { updateMemory: ({ memory }) => ({ maps: memory.maps + 1 }) },
  },
}));
