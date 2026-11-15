import { Option, Schema } from "effect";

/**
 * One command: its value (its key), its label and search keywords, its shortcuts, whether it is
 * disabled, and the sub-commands its page lists (none for a command that runs).
 */
export type Command = {
  readonly _tag: "Command";
  readonly value: string;
  readonly label: string;
  readonly keywords: ReadonlyArray<string>;
  readonly shortcuts: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly items: ReadonlyArray<Command>;
};

/**
 * A command's Schema; its `items` are commands again.
 */
export const Command: Schema.Codec<Command> = Schema.TaggedStruct("Command", {
  value: Schema.String,
  label: Schema.String,
  keywords: Schema.Array(Schema.String),
  shortcuts: Schema.Array(Schema.String),
  disabled: Schema.Boolean,
  // oxlint-disable-next-line lint-bomb/prefer-inferred-return-types -- a recursive Schema names its own type, or the suspension's type is circular
  items: Schema.Array(Schema.suspend((): Schema.Codec<Command> => Command)),
});

const Group = Schema.TaggedStruct("Group", { label: Schema.String, items: Schema.Array(Command) });

const Separator = Schema.TaggedStruct("Separator", {});

/**
 * One entry of a palette's list: a command, a labelled group of commands, or a separator.
 */
export const Entry = Schema.Union([Command, Group, Separator]);

/**
 * A palette's list, as its view passes it.
 */
export const Entries = Schema.Array(Entry);

/**
 * The app's own score for each command value at the current query, in place of the fuzzy score;
 * null to use the fuzzy score.
 */
export const Scores = Schema.NullOr(Schema.Record(Schema.String, Schema.Number));

type Entry = typeof Entry.Type;

type Group = typeof Group.Type;

type Ranking = typeof Scores.Type;

/**
 * A command with the defaults for whatever is not given.
 */
export const command = (
  value: string,
  label: string,
  more: Partial<Omit<Command, "_tag" | "value" | "label">> = {},
) =>
  ({
    _tag: "Command",
    value,
    label,
    keywords: [],
    shortcuts: [],
    disabled: false,
    items: [],
    ...more,
  }) satisfies Command;

/**
 * A labelled group of commands.
 */
export const group = (label: string, items: ReadonlyArray<Command>) => Group.make({ label, items });

/**
 * A separator between entries.
 */
export const separator = Separator.make({});

const folded = (text: string) => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();

const isWordStart = (text: string, at: number) =>
  at === 0 || !/[\p{L}\p{N}]/u.test(text.charAt(at - 1));

const scattered = (text: string, query: string) => {
  let at = 0;
  let starts = 0;

  for (const letter of query) {
    const found = text.indexOf(letter, at);

    if (found < 0) return 0;

    if (isWordStart(text, found)) starts += 1;
    at = found + 1;
  }

  return 0.3 + (0.2 * starts) / query.length;
};

const atWordStart = (text: string, query: string) => {
  for (let at = text.indexOf(query, 1); at > 0; at = text.indexOf(query, at + 1))
    if (isWordStart(text, at)) return true;

  return false;
};

/**
 * How well a text matches a query, from 0 (no match, hidden) to 1 (the whole text), ignoring case
 * and accents: the whole text beats a prefix, which beats a word start, a substring and letters
 * in order; within a tier, a match covering more of the text ranks higher, and among scattered
 * letters, more of them at word starts.
 */
export const fuzzyScore = (text: string, query: string) => {
  const t = folded(text);
  const q = folded(query).trim();
  const cover = (0.09 * q.length) / Math.max(t.length, 1);

  if (q === "" || t === q) return 1;

  if (t.startsWith(q)) return 0.9 + cover;

  if (atWordStart(t, q)) return 0.8 + cover;

  if (t.includes(q)) return 0.6 + cover;

  return scattered(t, q);
};

const scoreOf = (scores: Ranking, query: string) => (c: Command) => {
  if (scores !== null) return scores[c.value] ?? 0;

  return Math.max(fuzzyScore(c.label, query), ...c.keywords.map((k) => fuzzyScore(k, query)));
};

const inEntry = (e: Entry) => {
  if (e._tag === "Group") return e.items;

  return e._tag === "Command" ? [e] : [];
};

/**
 * The commands a list shows, in order, flattening groups.
 */
export const shownCommands = (entries: ReadonlyArray<Entry>) => entries.flatMap(inEntry);

// RETURN_TYPE: a recursive function names its result, or its inferred type is circular.
const everyCommand = (entries: ReadonlyArray<Command>): ReadonlyArray<Command> =>
  entries.flatMap((c) => [c, ...everyCommand(c.items)]);

/**
 * The command with a value, on any page.
 */
export const findCommand = (entries: ReadonlyArray<Entry>, value: string) =>
  Option.fromUndefinedOr(everyCommand(shownCommands(entries)).find((c) => c.value === value));

/**
 * Every enabled command with a shortcut, on every page, in list order; a disabled command's
 * shortcut does nothing.
 */
export const shortcutsOf = (entries: ReadonlyArray<Entry>) =>
  everyCommand(shownCommands(entries))
    .filter((c) => c.shortcuts.length > 0 && !c.disabled)
    .map((c) => c.value);

/**
 * The entries a stack of pages shows: the list itself for none, else the items of the command
 * each page names, in turn; none for a page no command names.
 */
export const pageOf = (entries: ReadonlyArray<Entry>, pages: ReadonlyArray<string>) =>
  pages.reduce(
    (shown, page) =>
      Option.flatMap(shown, (list) =>
        Option.fromUndefinedOr(
          shownCommands(list).find((c) => c.value === page && c.items.length > 0)?.items,
        ),
      ),
    Option.some<ReadonlyArray<Entry>>(entries),
  );

type Scored = { readonly entry: Entry; readonly score: number; readonly at: number };

const byScore = (a: Scored, b: Scored) => b.score - a.score || a.at - b.at;

const tidy = (entries: ReadonlyArray<Entry>) =>
  entries.filter(
    (e, i) =>
      e._tag !== "Separator" ||
      (i > 0 && i < entries.length - 1 && entries[i + 1]?._tag !== "Separator"),
  );

const scoredGroup = (g: Group, score: (c: Command) => number, at: number) => {
  const kept = g.items
    .map((c, i) => ({ entry: c, score: score(c), at: i }))
    .filter((s) => s.score > 0);

  const sorted = kept.toSorted(byScore);

  return {
    entry: group(
      g.label,
      sorted.map((s) => s.entry),
    ),
    score: sorted[0]?.score ?? 0,
    at,
    moved: sorted.some((s, i) => s !== kept[i]),
  };
};

const scoredEntry = (score: (c: Command) => number) => (entry: Entry, at: number) => {
  if (entry._tag === "Group") return scoredGroup(entry, score, at);

  return { entry, score: entry._tag === "Command" ? score(entry) : 1, at, moved: false };
};

/**
 * The entries a query shows, best first: an empty query keeps the list as it is; otherwise
 * entries scoring 0 are hidden, commands rank within their group and groups rank by their best
 * command, and separators stay only while ranking moves no entry.
 */
export const ranked = (entries: ReadonlyArray<Entry>, query: string, scores: Ranking) => {
  if (query.trim() === "") return entries;
  const all = entries.map(scoredEntry(scoreOf(scores, query)));
  const kept = all.filter((s) => s.entry._tag !== "Separator" && s.score > 0);
  const sorted = kept.toSorted(byScore);
  const moved = all.some((s) => s.moved) || sorted.some((s, i) => s !== kept[i]);

  if (moved) return sorted.map((s) => s.entry);

  return tidy(all.filter((s) => s.entry._tag === "Separator" || s.score > 0).map((s) => s.entry));
};
