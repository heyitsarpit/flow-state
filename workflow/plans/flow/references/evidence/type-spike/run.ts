import { Schema } from "effect"
import { domain, read, write, listen, eq, asc } from "./lib.js"
import * as A from "./app.js"
declare const console: { log(...a: any[]): void }
const j = (x: any) => JSON.stringify(x)
let pass = 0, fail = 0
const ck = (name: string, ok: boolean, info?: any) => { ok ? pass++ : fail++; console.log(ok ? "PASS" : "FAIL", name, ok || info === undefined ? "" : j(info)) }
const ref = (root: string, ...path: string[]) => ({ type: "ref", root, path })
const n = A.NotesDomain.ir

// ---- recorded description
ck("inFolder where", j(n.inFolder.where) === j({ type: "func", name: "eq", args: [ref("record", "folderId"), ref("input", "folderId")] }), n.inFolder.where)
ck("inFolder total order", j(n.inFolder.orderBy.map((k: any) => [k.dir, k.ref.path[0]])) === j([["desc", "pinned"], ["asc", "title"], ["asc", "noteId"]]), n.inFolder.orderBy)
ck("inFolder pagedBy input and next", j(n.inFolder.pagedBy) === j({ input: ref("input", "cursor"), next: ["next"] }), n.inFolder.pagedBy)
ck("pinnedCount derived fields", j(n.pinnedCount.derivedFrom[0].fields) === j([ref("record", "pinned")]), n.pinnedCount)
ck("search serverMatches recorded", j(n.search.where.args[1]) === j({ type: "func", name: "serverMatches", args: [ref("input", "q"), ref("record", "title"), ref("record", "body")] }), n.search.where)
ck("search place through an array", j(n.search.places[0].path) === j(["hits", "*", "note"]) && j(n.search.places[0].context) === "[]", n.search.places[0])
ck("search carries vs context", j(n.search.places[0].carries) === j(["noteId", "title", "body", "workspaceId"]), n.search.places[0])
ck("ranked ignoring + unaffectedBy", j(n.ranked.ignoring) === j([ref("input", "cursor")]) && j(n.ranked.unaffectedBy) === j(["pinned", "author"]), n.ranked)
ck("rename predicts entity, key, fields", j(n.rename.predicts[0]) === j({ type: "change", entity: "notes/Note", op: "patch", key: ref("input", "key"), fields: { title: ref("input", "title") } }), n.rename.predicts)
ck("remove predicts a delete", n.remove.predicts[0].op === "delete" && n.remove.places === undefined, n.remove)
ck("events: entity list, mapping not run", j(n.events) === j({ op: "listen", operation: "notes/events", changes: ["notes/Note"], mapping: "runtime" }), n.events)
ck("nested path in a condition", j(A.AuthorDomain.ir.notes.where.args[0]) === j(ref("record", "author", "userId")), A.AuthorDomain.ir.notes.where)

const b = A.BankDomain.ir
ck("principal() in a condition", j(b.accounts.where.args[1]) === j({ type: "principal" }), b.accounts.where)
ck("transfer: two places", j(b.transfer.places.map((p: any) => p.path)) === j([["from"], ["to"]]), b.transfer.places)
ck("transfer: per-field function recorded as runtime", j(b.transfer.predicts.map((c: any) => c.fields.balance)) === j([{ type: "runtime" }, { type: "runtime" }]), b.transfer.predicts)
ck("transfer: Entity.where targets read the input", j(b.transfer.alsoChanges[0].where.args[1]) === j(ref("input", "from", "accountId")), b.transfer.alsoChanges)

const c = A.CalendarDomain.ir
ck("calendar unordered + overlaps", c.week.unordered === true && c.week.where.args[1].name === "overlaps", c.week)
ck("write with only a target", c.editSeries.alsoChanges[0].where.name === "and" && c.editSeries.places === undefined, c.editSeries)

const ad = A.AdminDomain.ir
ck("admin two wheres combined", ad.users.where.name === "and" && ad.users.where.args[0].name === "oneOf", ad.users.where)
ck("admin array keys and a constant", j(ad.archive.predicts[0].key) === j(ref("input", "keys")) && j(ad.archive.predicts[0].fields.status) === j({ type: "val", value: "archived" }), ad.archive.predicts)

const f = A.FilesDomain.ir
ck("files: two members at one place", j(f.contents.places.map((p: any) => [p.entity, p.member.kind])) === j([["files/File", "file"], ["files/Folder", "folder"]]), f.contents.places)
ck("files: member shapes differ", j(f.contents.places[0].carries).includes("size") && !j(f.contents.places[1].carries).includes("size"), f.contents.places)
ck("files: two derivedFrom with own conditions", f.folderSize.derivedFrom.length === 2 && f.folderSize.derivedFrom.every((d: any) => d.where.name === "serverMatches"), f.folderSize.derivedFrom)

const so = A.SocialDomain.ir
ck("Entity.fields target", j(so.comment.alsoChanges[0]) === j({ type: "target", entity: "social/Post", key: ref("input", "post"), fields: [ref("record", "commentCount")] }), so.comment.alsoChanges)
ck("cross-entity prediction recorded", so.comment.predicts[0].entity === "social/Post", so.comment.predicts)

const sh = A.ShopDomain.ir
ck("singleton: whole result, key from response", j(sh.cart.places[0].path) === "[]" && sh.cart.byKey === undefined, sh.cart)
ck("pick: price is context, not carried", !sh.lines.places[0].carries.includes("price") && sh.lines.places[0].context.includes("price"), sh.lines.places[0])

// ---- predictions run again for real when the write starts
const transferChain: any = A.BankDomain.entries.transfer
const real = transferChain.predicts_[0]({ input: { from: { accountId: "a" }, to: { accountId: "b" }, amount: 30 } })
const fromBal = real[0].values.balance
ck("real run: per-field function computes from the record and the real input", typeof fromBal === "function" && fromBal({ balance: 100 }) === 70, real)
ck("real run: the key is the real value", j(real[0].key) === j({ type: "object", fields: { accountId: { type: "val", value: "a" } } }), real[0].key)

// ---- what recording rejects
const tryDomain = (mk: () => any) => { try { domain("t", { a: mk() } as any); return "NO ERROR" } catch (e: any) { return String(e.message) } }
const list = (): any => read(A.notesInFolder).list(A.Note, ({ result }: any) => result.notes)
const m1 = tryDomain(() => list().where(({ input, record }: any) => record.folderId === input.folderId))
ck("=== names the right form", m1.includes("received a boolean") && m1.includes("eq("), m1)
const m2 = tryDomain(() => list().where(({ record }: any) => eq(record.revision, 1)))
ck("version field rejected at runtime too", m2.includes("version field"), m2)
const m3 = tryDomain(() => list().where(({ input, record }: any) => eq(record.title, `${input.folderId}!`)))
ck("template string throws with the path", m3.includes("input.folderId"), m3)
const m4 = tryDomain(() => list().where(({ input, record }: any) => eq(record.title.trim(), input.folderId)))
ck("method call throws with the path", m4.includes("record.title.trim"), m4)
const m5 = tryDomain(() => list().orderBy(({ record }: any) => asc(record.noteId)))
ck(".orderBy must return an array", m5.includes("array of asc"), m5)
const m6 = tryDomain(() => read(A.folderContents).list(A.File, ({ result }: any) => result.items, { kind: "dir" }))
ck("unknown union member", m6.includes("no member"), m6)
const m7 = tryDomain(() => read(A.notesInFolder).list(A.Note, ({ result }: any) => result.nots))
ck("bad place path", m7.includes('no field "nots"'), m7)
const tern = domain("t", { a: list().where(({ input, record }: any) => record.pinned ? eq(record.folderId, input.folderId) : eq(record.noteId, input.folderId)) } as any).ir.a.where
ck("ternary still records one branch silently (needs the source check)", tern.args[0].path[0] === "folderId", tern)

console.log(`\n${pass} pass, ${fail} fail`)
