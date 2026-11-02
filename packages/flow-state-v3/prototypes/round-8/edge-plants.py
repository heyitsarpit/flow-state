# The proposal's plants, on the real runtime. Each edits a scratch copy; run-plants.sh runs the suite and a search on it. Reality's two are in run7 --only spy.
import sys
k=sys.argv[1]; p='round-8-plant/'
def sub(f,a,b):
    s=open(p+f).read(); assert a in s,a; open(p+f,'w').write(s.replace(a,b))
E='edge.ts'
P={
'twoOut':lambda: sub(E,'if (s === undefined || s.out !== undefined || s.dirty.size === 0) return;','if (s === undefined || s.dirty.size === 0) return;'),
'oldWins':lambda: sub(E,'for (const w of out.writes) if (!s.dirty.has(w.key)) s.dirty.set(w.key, w);','for (const w of out.writes) s.dirty.set(w.key, w);'),
'noMerge':lambda: sub(E,'for (const w of out.writes) if (!s.dirty.has(w.key)) s.dirty.set(w.key, w);',''),
'partial':lambda: sub(E,'const goes = encoded !== undefined || (w.record === undefined && w.value !== undefined);','const goes = encoded !== undefined && (w.record !== undefined || tickets0 > 0 || w.value === undefined);').__class__ and sub(E,'const writes: Bytes[] = [];','const writes: Bytes[] = [];\n    const tickets0 = s.tickets.length;'),
'poisonDeletes':lambda: sub(E,'const goes = encoded !== undefined || (w.record === undefined && w.value !== undefined);','const goes = encoded !== undefined || w.record === undefined;'),
'poisonAll':lambda: (sub(E,'o.report({ code: "UnencodableValue", origin: scope, input: String(e) });\n      return undefined;','o.report({ code: "UnencodableValue", origin: scope, input: String(e) });\n      poisonedAny = true;\n      return undefined;'), sub(E,'const encoded = encodeAll(scope, s);','const encoded = encodeAll(scope, s);\n    if (poisonedAny && encoded) return;'), sub(E,'const slots = new Map<string, Slot>();','let poisonedAny = false;\n  const slots = new Map<string, Slot>();')),
'debounce':lambda: sub(E,'if (!inBackoff && at < s.due) wakeAt(c.scope, s, at);','if (!inBackoff) wakeAt(c.scope, s, at);'),
'ignoresNow':lambda: sub(E,'const urgent = c.now || c.ticket','const urgent = c.ticket'),
'noSilent':lambda: sub(E,'o.report({ code: "StorageSilent", origin: scope })','undefined'),
'storedEarly':lambda: sub(E,'s.out = out;\n','s.out = out;\n    for (const t of tickets) o.stored(t, true);\n'),
'noTicket':lambda: sub(E,'if (c.ticket) s.tickets.push(c.ticket);',''),
'encodeOnTurn':lambda: sub(E,'for (const w of c.writes) s.dirty.set(w.key, w);','for (const w of c.writes) {\n        if (w.record !== undefined) try { o.encode(w.record); } catch {}\n        s.dirty.set(w.key, w);\n      }'),
'hiddenWaits':lambda: sub(E,' || host.isHidden()',''),
}
P[k]()
