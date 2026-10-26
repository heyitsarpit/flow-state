/* App: file manager.
 * - A folder's listing returns its files and subfolders in one array (`kind` tells them apart),
 *   sorted by name, then kind, then id.
 * - A folder's size is computed by the server over its whole subtree (files inside subfolders count).
 * - Users move a file to another folder; it must show in its new folder instantly where possible.
 */
import { Schema } from "effect"
import { entity, resource, transaction } from "../lib.js"
import { ok, commit } from "./common.js"
const S = Schema.String, N = Schema.Number
export const File = entity({ id: "files/File", fields: { id: S, kind: Schema.Literal("file"), parentId: S, name: S, size: N }, primaryKey: ["id"] })
export const Folder = entity({ id: "files/Folder", fields: { id: S, kind: Schema.Literal("folder"), parentId: S, name: S }, primaryKey: ["id"] })
const FileRow = Schema.Struct({ id: S, kind: Schema.Literal("file"), parentId: S, name: S, size: N })
const FolderRow = Schema.Struct({ id: S, kind: Schema.Literal("folder"), parentId: S, name: S })
export const folderContents = resource({ id: "files/contents", key: (i: { folderId: string }) => i, lookup: ok,
  result: Schema.Struct({ items: Schema.Array(Schema.Union([FileRow, FolderRow])) }) })
export const folderSize = resource({ id: "files/size", key: (i: { folderId: string }) => i, lookup: ok, result: N })
export const moveFile = transaction({ id: "files/move", input: Schema.Struct({ key: Schema.Struct({ id: S }), to: S }), result: FileRow, commit })
