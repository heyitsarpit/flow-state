// Type-level assertions: a clean compile must not come from `any`.
import type { ReadEntry, WriteEntry, RecordNode, Leaf } from "./lib.js"
import * as A from "./app.js"
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
type Expect<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type Used<E> = E extends ReadEntry<any, infer U, any, any> ? U : "not a read"
type Paged<E> = E extends ReadEntry<any, any, any, infer P> ? P : "not a read"
type Named<E> = E extends WriteEntry<any, infer N, any> ? N : "not a write"
type Patched<E> = E extends WriteEntry<any, any, infer P> ? P : "not a write"
type NE = typeof A.NotesDomain.entries
type FE = typeof A.FilesDomain.entries
type RecOf<E> = E extends { where(f: (c: { input: any; record: infer R }) => any): any } ? R : "no record"

export type checks = [
  Expect<Equal<Used<NE["inFolder"]>, "folderId" | "cursor">>,
  Expect<Equal<Paged<NE["inFolder"]>, true>>,
  Expect<Equal<Paged<NE["search"]>, false>>,
  Expect<Equal<Used<NE["search"]>, "workspaceId" | "q">>,
  Expect<Equal<Used<NE["ranked"]>, "folderId" | "cursor">>,
  Expect<Equal<Named<NE["rename"]>, "notes/Note">>,
  Expect<Equal<Patched<NE["rename"]>, "notes/Note">>,
  Expect<Equal<Patched<NE["remove"]>, never>>,
  Expect<Equal<Named<typeof A.SocialDomain.entries["comment"]>, "social/Comment" | "social/Post">>,
  Expect<Equal<Patched<typeof A.SocialDomain.entries["comment"]>, "social/Post">>,
  Expect<Equal<Named<typeof A.BankDomain.entries["transfer"]>, "bank/Account" | "bank/Txn">>,
  Expect<Equal<IsAny<RecOf<FE["contents"]>>, false>>,
  // the two-entity listing's record has exactly the shared fields, with the tag as a union
  Expect<Equal<keyof RecOf<FE["contents"]>, "id" | "kind" | "parentId" | "name">>,
  Expect<Equal<RecOf<FE["contents"]>["kind"], Leaf<"file" | "folder", never, "kind">>>,
  // the version field is not in `record`
  Expect<Equal<"revision" extends keyof RecOf<NE["inFolder"]> ? true : false, false>>,
  // the nested entity is reachable
  Expect<Equal<RecOf<NE["inFolder"]>["author"]["userId"], Leaf<string, never, "author">>>,
]
