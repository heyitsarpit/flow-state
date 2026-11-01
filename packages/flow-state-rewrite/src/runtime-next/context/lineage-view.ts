import type { ContextCut, ContextLineage } from "./lineage-model.js";

export type ContextLineageViewReader = {
  size(lineage: ContextLineage): number;
  get(lineage: ContextLineage, key: string): ContextCut | undefined;
  entries(lineage: ContextLineage): Iterable<[string, ContextCut]>;
};

const readers = new WeakMap<ContextLineageView, ContextLineageViewReader>();

const readerOf = (view: ContextLineageView) => {
  const reader = readers.get(view);

  if (reader === undefined) throw new TypeError("Context lineage view has no reader");

  return reader;
};

class ContextLineageView implements ReadonlyMap<string, ContextCut> {
  [Symbol.toStringTag] = "ContextLineage";

  constructor(reader: ContextLineageViewReader) {
    readers.set(this, reader);
    // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published lineage view cannot shadow root or size; P055-CONTEXT-VIEW.
    Object.freeze(this);
  }

  // RETURN_TYPE: The reader accepts this ReadonlyMap, so inference recurses through its size getter.
  get size(): number {
    return readerOf(this).size(this);
  }

  // RETURN_TYPE: The ReadonlyMap port returns a missing cut as undefined.
  get(key: string): ContextCut | undefined {
    return readerOf(this).get(this, key);
  }

  // RETURN_TYPE: ReadonlyMap lookup must remain boolean through parent layers.
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  // RETURN_TYPE: The ReadonlyMap port requires MapIterator's undefined completion type.
  *entries(): MapIterator<[string, ContextCut]> {
    yield* readerOf(this).entries(this);
  }

  // RETURN_TYPE: The ReadonlyMap port requires MapIterator's undefined completion type.
  *keys(): MapIterator<string> {
    for (const [key] of this.entries()) yield key;
  }

  // RETURN_TYPE: The ReadonlyMap port requires MapIterator's undefined completion type.
  *values(): MapIterator<ContextCut> {
    for (const [, cut] of this.entries()) yield cut;
  }

  forEach(callback: (value: ContextCut, key: string, map: ContextLineage) => void) {
    for (const [key, cut] of this.entries()) callback(cut, key, this);
  }

  // RETURN_TYPE: The ReadonlyMap port requires MapIterator's undefined completion type.
  [Symbol.iterator](): MapIterator<[string, ContextCut]> {
    return this.entries();
  }
}

// RETURN_TYPE: Hide the private Map implementation behind the readonly lineage port.
export const makeContextLineageView = (reader: ContextLineageViewReader): ContextLineage =>
  new ContextLineageView(reader);
