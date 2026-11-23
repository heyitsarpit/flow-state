import { Option, Result } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { resolvePosition } from "./admit-position.ts";
import { type Owing, resolveWork } from "./admit-work.ts";
import { actorNamed } from "./record-names.ts";
import { keyText, RecordKey } from "./record-key.ts";
import { encodePosition } from "./record.ts";
import { type Group, structure } from "./record-structure.ts";
import {
  type ActorId,
  type ActorRecord,
  actorKey,
  byCodeUnits,
  type Carried,
  type Lane,
  type LaneId,
  Mark,
  Place,
  Quarantine,
} from "./world.ts";

export type { RestoredRow } from "./admit-work.ts";

/**
 * A record the boot judged, as a report names it.
 */
export type RecordReport = {
  readonly code: "RecordUndecodable" | "FieldDropped" | "ObligationCarried" | "UnboundLane";
  readonly record: string;
  readonly reason: string;
};

/**
 * What a boot admits from the store, to install: the positions it restores, the lanes and rows its
 * identities' work records owe in delivery order, the parts it carries unread, the legacy keys the
 * next work write removes, the records it kept or reset unread, its reports, the keys to rewrite,
 * and the identities owed an ending whose position is restored.
 */
export type Admitted = {
  readonly records: ReadonlyArray<ActorRecord>;
  readonly lanes: ReadonlyArray<readonly [LaneId, Lane]>;
  readonly rows: ReadonlyArray<Owing>;
  readonly carried: ReadonlyMap<string, Carried>;
  readonly legacy: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly quarantined: ReadonlyMap<string, Quarantine>;
  readonly reports: ReadonlyArray<RecordReport>;
  readonly dirty: ReadonlyArray<readonly [string, Mark]>;
  readonly owing: ReadonlyArray<ActorId>;
};

const listed = (parts: ReadonlyArray<string>) =>
  parts.length <= 3
    ? parts.join(", ")
    : `${parts.slice(0, 3).join(", ")} and ${parts.length - 3} more`;

const placeText = (place: Place) =>
  Place.$match(place, {
    Subject: ({ subject }) => `subject ${subject}`,
    Contract: ({ contract }) => `lanes of ${contract}`,
    Lane: ({ contract, keyText: k }) => `lane ${contract} ${k}`,
    Displaced: ({ contract, keyText: k }) => `a displaced Attempt of ${contract} ${k}`,
    Row: ({ after }) => `row after ${after}`,
  });

const quarantineReason = (q: Quarantine) =>
  Quarantine.$match(q, {
    Reset: ({ why, detail }) => `reset (${why}): ${detail}`,
    Kept: ({ why, detail }) => `kept (${why}): ${detail}`,
  });

// One identity's share of the admission.
type Share = {
  readonly records: ReadonlyArray<ActorRecord>;
  readonly lanes: ReadonlyArray<readonly [LaneId, Lane]>;
  readonly rows: ReadonlyArray<Owing>;
  readonly carried: ReadonlyArray<readonly [string, Carried]>;
  readonly legacy: ReadonlyArray<readonly [string, ReadonlyArray<string>]>;
  readonly quarantined: ReadonlyArray<readonly [string, Quarantine]>;
  readonly reports: ReadonlyArray<RecordReport>;
  readonly dirty: ReadonlyArray<readonly [string, Mark]>;
  readonly owing: ReadonlyArray<ActorId>;
};

const nothing: Share = {
  records: [],
  lanes: [],
  rows: [],
  carried: [],
  legacy: [],
  quarantined: [],
  reports: [],
  dirty: [],
  owing: [],
};

// RETURN_TYPE: two shares joined are one Share, field by field.
const joined = (a: Share, b: Share): Share => ({
  records: [...a.records, ...b.records],
  lanes: [...a.lanes, ...b.lanes],
  rows: [...a.rows, ...b.rows],
  carried: [...a.carried, ...b.carried],
  legacy: [...a.legacy, ...b.legacy],
  quarantined: [...a.quarantined, ...b.quarantined],
  reports: [...a.reports, ...b.reports],
  dirty: [...a.dirty, ...b.dirty],
  owing: [...a.owing, ...b.owing],
});

type Named = { readonly actor: ActorId; readonly input: Values };

type SavedPosition = Option.Option.Value<Group["position"]>;

type SavedWork = Option.Option.Value<Group["work"]>;

// A group's position: Live, with its dropped leaves reported and its key marked when its saved form
// changes, or reset.
const positionShare = (
  machines: ReadonlyMap<string, Compiled>,
  compiled: Compiled,
  named: Named,
  position: SavedPosition,
) =>
  Result.match(resolvePosition(machines, compiled, named.actor, named.input, position.body), {
    onFailure: (q) => ({ ...nothing, quarantined: [[position.key, q]] }) satisfies Share,
    onSuccess: ({ record, dropped }) => {
      const again = encodePosition(machines, compiled, record);
      const same = Result.isSuccess(again) && Option.contains(position.text, again.success);

      const reported: ReadonlyArray<RecordReport> =
        dropped.length === 0
          ? []
          : [{ code: "FieldDropped", record: position.key, reason: `dropped ${listed(dropped)}` }];

      return {
        ...nothing,
        records: [record],
        reports: reported,
        dirty:
          dropped.length === 0 && same ? [] : [[position.key, Mark.Actor({ actor: named.actor })]],
      } satisfies Share;
    },
  });

// What a group's work carries, reported by its key.
// RETURN_TYPE: a report list, so both branches give RecordReports.
const carriedReport = (key: string, carried: Carried): ReadonlyArray<RecordReport> =>
  carried.length === 0
    ? []
    : [
        {
          code: "ObligationCarried",
          record: key,
          reason: `${carried.length} carried: ${listed(carried.map((c) => `${placeText(c.place)} (${c.why})`))}`,
        },
      ];

// A group's work: its lanes and rows, what it carries, reported, and its key marked when its saved
// form changes; an identity whose position is restored is woken when owed.
// RETURN_TYPE: a Share, so its pairs are typed as the admission joins them.
const workShare = (compiled: Compiled, actor: ActorId, live: boolean, work: SavedWork): Share => {
  const read = resolveWork(compiled, actor, work.body, work.stepped);

  const unbound: ReadonlyArray<RecordReport> =
    read.lanes.length > 0 && !live
      ? [{ code: "UnboundLane", record: work.key, reason: "no actor record holds it" }]
      : [];

  return {
    ...nothing,
    lanes: read.lanes,
    rows: read.rows,
    carried: read.carried.length === 0 ? [] : [[actorKey(actor), read.carried]],
    reports: [...carriedReport(work.key, read.carried), ...unbound],
    dirty: read.dirty ? [[work.key, Mark.Work({ actor })]] : [],
    owing: read.rows.length > 0 && live ? [actor] : [],
  };
};

// Stage 2 for one group: its machine first, then its name, then each side through the reference
// table.
// RETURN_TYPE: a Share, so its pairs are typed as the admission joins them.
const groupShare = (
  machines: ReadonlyMap<string, Compiled>,
  settled: ReadonlyMap<string, Quarantine>,
  group: Group,
): Share => {
  const compiled = machines.get(group.owner.machine);

  const named = Option.flatMap(Option.fromUndefinedOr(compiled), () =>
    actorNamed(machines, group.owner.machine, group.owner.name),
  );

  if (compiled === undefined || Option.isNone(named)) {
    const why =
      compiled === undefined
        ? Quarantine.Kept({ why: "Orphan", detail: "machine" })
        : Quarantine.Kept({ why: "Name", detail: "name" });

    return {
      ...nothing,
      quarantined: group.keys.filter((key) => !settled.has(key)).map((key) => [key, why] as const),
    };
  }

  const actor = named.value.actor;

  const position = Option.match(group.position, {
    onNone: () => nothing,
    onSome: (p) => positionShare(machines, compiled, named.value, p),
  });

  const work = Option.match(group.work, {
    onNone: () => nothing,
    onSome: (w) => workShare(compiled, actor, position.records.length > 0, w),
  });

  const legacy: Share = {
    ...nothing,
    legacy: group.legacy.length > 0 ? [[actorKey(actor), group.legacy]] : [],
    dirty: group.emptied
      ? [[keyText(RecordKey.Work({ owner: group.owner })), Mark.Work({ actor })]]
      : [],
  };

  return [position, work, legacy].reduce(joined, nothing);
};

/**
 * The boot's admission of a store: every key structured (stage 1), then each group judged against
 * the machine its key names through the reference table (stage 2), with its lanes' and rows'
 * endings derived. Pure; writes nothing, calls no user code but a Schema's decode, and returns for
 * every map of strings.
 *
 * **Details**
 *
 * - A key that is not this format's, a group holding a newer format, a work side that fails stage
 *   1, a machine no longer declared and a name that does not read are kept unread; a position that
 *   fails, names a state the machine lacks or holds a memory field that does not read resets.
 * - A position leaf whose name is gone or does not read is dropped and reported; a work part whose
 *   names do not read is carried byte for byte, its lane key still held, and reported.
 * - Each record's report names its key, once per boot.
 */
export const admit = (
  machines: ReadonlyMap<string, Compiled>,
  stored: ReadonlyMap<string, string>,
) => {
  const { groups, quarantined: settled } = structure(machines, stored);

  const share = groups.map((group) => groupShare(machines, settled, group)).reduce(joined, nothing);

  const quarantined = new Map([...settled, ...share.quarantined]);

  const reports = [
    ...share.reports,
    ...[...quarantined].map(
      ([key, q]) =>
        ({
          code: "RecordUndecodable",
          record: key,
          reason: quarantineReason(q),
        }) satisfies RecordReport,
    ),
  ];

  return {
    records: share.records,
    lanes: share.lanes,
    rows: share.rows,
    carried: new Map(share.carried),
    legacy: new Map(share.legacy),
    quarantined,
    reports: reports.toSorted((a, b) => byCodeUnits(a.record, b.record)),
    dirty: share.dirty,
    owing: share.owing,
  } satisfies Admitted;
};
