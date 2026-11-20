/**
 * Flow State's persistence route: the `Store` a persisted setup's services provide, and the
 * IndexedDB adapter. Importing it opens nothing.
 */
export { Store, StoreRefused, StoreScope } from "./store.ts";

export type { StoreWrite } from "./store.ts";

export { layerIndexedDb } from "./platform/indexeddb.ts";
