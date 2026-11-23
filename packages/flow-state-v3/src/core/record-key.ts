import { Data, Option } from "effect";

/**
 * An identity as a record key names it: its machine id and its name, unescaped.
 */
export type Owner = { readonly machine: string; readonly name: string };

/**
 * A record key, by its kind: an identity's position (`actor/`) or work (`work/`), or a format 5
 * lane or owed record, which only the format step reads.
 */
export type RecordKey = Data.TaggedEnum<{
  Actor: { owner: Owner };
  Work: { owner: Owner };
  Lane: { owner: Owner; operation: string; keyText: string };
  Owed: { owner: Owner };
}>;

/**
 * Constructors and matchers for {@link RecordKey}.
 */
export const RecordKey = Data.taggedEnum<RecordKey>();

const escape = (name: string) =>
  name.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C");

const unescape = (text: string) =>
  text.replaceAll("%7C", "|").replaceAll("%2F", "/").replaceAll("%25", "%");

/**
 * The text an identity's records are keyed by: its machine, then its name with `%`, `/` and `|`
 * escaped, so the last `/` ends the machine and no `|` belongs to the name.
 */
export const ownerText = (owner: Owner) => `${owner.machine}/${escape(owner.name)}`;

/**
 * A record key as the store holds it.
 */
export const keyText = (key: RecordKey) =>
  RecordKey.$match(key, {
    Actor: ({ owner }) => `actor/${ownerText(owner)}`,
    Work: ({ owner }) => `work/${ownerText(owner)}`,
    Lane: ({ owner, operation, keyText: text }) => `lane/${ownerText(owner)}|${operation}|${text}`,
    Owed: ({ owner }) => `owed/${ownerText(owner)}`,
  });

// An owner's text read back: the machine before its last `/`, the name after it, unescaped.
const ownerOf = (text: string) => {
  const cut = text.lastIndexOf("/");

  return cut <= 0 || cut === text.length - 1
    ? Option.none<Owner>()
    : Option.some({ machine: text.slice(0, cut), name: unescape(text.slice(cut + 1)) });
};

// A key's text after its kind's prefix, read as that kind.
const parsers: ReadonlyArray<readonly [string, (rest: string) => Option.Option<RecordKey>]> = [
  ["actor/", (rest) => Option.map(ownerOf(rest), (owner) => RecordKey.Actor({ owner }))],
  ["work/", (rest) => Option.map(ownerOf(rest), (owner) => RecordKey.Work({ owner }))],
  ["owed/", (rest) => Option.map(ownerOf(rest), (owner) => RecordKey.Owed({ owner }))],
  [
    "lane/",
    (rest) => {
      const first = rest.indexOf("|");
      const second = first < 0 ? -1 : rest.indexOf("|", first + 1);

      if (second < 0) return Option.none();

      return Option.map(ownerOf(rest.slice(0, first)), (owner) =>
        RecordKey.Lane({
          owner,
          operation: rest.slice(first + 1, second),
          keyText: rest.slice(second + 1),
        }),
      );
    },
  ],
];

/**
 * A stored key read as a record key: only a key that prints back to the same text, so one key
 * names one record and one identity.
 */
export const parseKey = (text: string) =>
  Option.filter(
    Option.flatMap(
      Option.fromUndefinedOr(parsers.find(([prefix]) => text.startsWith(prefix))),
      ([prefix, parse]) => parse(text.slice(prefix.length)),
    ),
    (key) => keyText(key) === text,
  );

/**
 * An owner's text read back, as a saved provider's wiring names it: only text that prints back the
 * same.
 */
export const parseOwner = (text: string) =>
  Option.filter(ownerOf(text), (owner) => ownerText(owner) === text);

const ENTRY = "entry/";

/**
 * The key a saved read entry is stored under: its contract, then its key's canonical text.
 */
export const entryRecordKey = (contract: string, text: string) => `${ENTRY}${contract}|${text}`;

/**
 * A stored key read as a saved entry's: its contract and its key text, when it is one; only a key
 * that prints back to the same text.
 */
export const parseEntryKey = (stored: string) => {
  if (!stored.startsWith(ENTRY)) return Option.none();

  const rest = stored.slice(ENTRY.length);
  const cut = rest.indexOf("|");

  return Option.filter(
    cut <= 0
      ? Option.none()
      : Option.some({ contract: rest.slice(0, cut), text: rest.slice(cut + 1) }),
    (e) => entryRecordKey(e.contract, e.text) === stored,
  );
};

/**
 * The text a lane is kept under in a Runtime: its identity's owner text, its operation and its key
 * text.
 */
export const laneText = (owner: Owner, operation: string, text: string) =>
  `${ownerText(owner)}|${operation}|${text}`;

/**
 * The key text of the lane whose text is `kept`, as an identity's operation keeps it: `None` when
 * it is not one of that operation's lanes.
 */
export const keyTextOfLane = (owner: Owner, operation: string, kept: string) => {
  const prefix = laneText(owner, operation, "");

  return kept.startsWith(prefix) ? Option.some(kept.slice(prefix.length)) : Option.none<string>();
};
