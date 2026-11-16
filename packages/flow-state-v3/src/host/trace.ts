import { Data, Duration, Formatter, Option } from "effect";
import type { Values } from "../core/compiled.ts";
import { Evidence, type Member, MemberTarget, type Part } from "../core/evidence.ts";
import { actorKey } from "../core/world.ts";
import type { Purpose } from "./host.ts";
import type { Batch, CallStatus } from "./testing/fake.ts";
import { Step, type Tab, WorldWord } from "./testing/steps.ts";

/**
 * What one trace event records: a step at its start, a call an endpoint received, a store write
 * batch, or one Runtime evidence record.
 *
 * **Details**
 *
 * A Request's `status` and a Write's `status` are as they stood at the run's end, so a call held
 * and never released reads held, and a dead tab's released write reads aborted.
 */
export type TraceRecord = Data.TaggedEnum<{
  Step: { index: number; step: Step };
  Request: { server: string; endpoint: string; input: Values; status: CallStatus };
  Write: {
    purpose: Purpose;
    keys: ReadonlyArray<string>;
    acknowledges: ReadonlyArray<string>;
    status: Batch["status"];
  };
  Runtime: { evidence: Evidence };
}>;

/**
 * Constructors and matchers for {@link TraceRecord}.
 */
export const TraceRecord = Data.taggedEnum<TraceRecord>();

/**
 * One event of a trace: its run-wide sequence, the tab it came from and what it records.
 */
export type TraceEvent = {
  readonly sequence: number;
  readonly tab: Tab;
  readonly record: TraceRecord;
};

/**
 * A finished run's trace: its Story's id and every event in the order it happened.
 *
 * **Details**
 *
 * Sequences start at 1 and rise by 1 across every tab and open of the run. The run's own evidence sink
 * stamps them; the Runtime's evidence records carry none.
 */
export type Trace = {
  readonly storyId: string;
  readonly events: ReadonlyArray<TraceEvent>;
};

// FLOW_STATE_ALLOW_UNKNOWN: a trace prints any value an input, key or memory holds.
const json = (value: unknown) => Formatter.formatJson(value);

const attemptText = (attempt: Option.Option<string>) => Option.getOrElse(attempt, () => "-");

const targetText = (target: MemberTarget) =>
  MemberTarget.$match(target, {
    Only: () => "",
    Key: ({ key }) => ` ${json(key)}`,
    Every: () => " every",
    Nothing: () => " nothing",
  });

const memberText = (member: Member) =>
  `${member.kind} ${member.operation}${targetText(member.target)}`;

const partText = (part: Part) => `${part.at} ${part.node} -> ${part.target}`;

const listText = (label: string, items: ReadonlyArray<string>) =>
  items.length === 0 ? "" : ` ${label} [${items.join("; ")}]`;

const wordText = (word: WorldWord) =>
  WorldWord.$match(word, {
    control: ({ server, control, input }) => `${server.name}.${control} ${json(input)}`,
    wire: ({ server, endpoint, word: kind, at }) =>
      `${server.name}.${endpoint} ${kind}${kind === "release" ? "" : ` at ${at}`}`,
    storage: ({ word: kind }) => `storage ${kind}`,
    stored: ({ key, text }) => `storage put ${key} ${text}`,
    network: ({ word: kind }) => `network ${kind}`,
  });

const stepText = (step: Step) =>
  Step.$match(step, {
    ensure: ({ actor }) => `ensure ${actorKey(actor)}`,
    detach: ({ actor }) => `detach ${actorKey(actor)}`,
    send: ({ actor, event: { _tag, ...payload } }) =>
      `send ${actorKey(actor)} ${_tag} ${json(payload)}`,
    dispose: ({ actor, how }) => `${how} ${actorKey(actor)}`,
    disposeRuntime: () => "disposeRuntime",
    world: ({ words }) => `world ${words.map(wordText).join(", ")}`,
    advance: ({ duration }) => `advance ${Duration.toMillis(duration)} ms`,
    reload: ({ reattach, heldWrites }) =>
      `reload${reattach ? "" : " without reattach"}${heldWrites === "land" ? ", held writes land" : ""}`,
    checkpoint: ({ name }) => `checkpoint ${name}`,
  });

const evidenceText = (evidence: Evidence) =>
  Evidence.$match(evidence, {
    Turn: ({ actor, event, from, to, parts, members }) =>
      `turn ${actorKey(actor)} ${event} ${from} -> ${to}${listText("parts", parts.map(partText))}${listText("members", members.map(memberText))}`,
    Minted: ({ operation, attempt, actor, key }) =>
      `minted ${operation} ${attempt} for ${actorKey(actor)} key ${json(key)}`,
    Sent: ({ operation, attempt }) => `sent ${operation} ${attempt}`,
    Ended: ({ operation, attempt, channel, reason, actor }) =>
      `ended ${operation} ${attemptText(attempt)} ${channel} ${reason} for ${actorKey(actor)}`,
    Delivered: ({ operation, attempt, event, actor }) =>
      `delivered ${operation} ${attemptText(attempt)} as ${event} to ${actorKey(actor)}`,
    Parked: ({ operation, attempt }) => `parked ${operation} ${attemptText(attempt)}`,
    Unparked: ({ operation, attempt }) => `unparked ${operation} ${attemptText(attempt)}`,
    Recorded: ({ operation, attempt, why }) =>
      `recorded ${operation} ${attemptText(attempt)} ${why}`,
    Unhandled: ({ actor, event }) => `unhandled ${event} at ${actorKey(actor)}`,
    SendTargetAbsent: ({ actor, event, reason }) =>
      `send ${event} to ${actorKey(actor)} dropped: SendTargetAbsent ${reason}`,
    Denied: ({ actor, event, reasons }) =>
      `denied ${event} at ${actorKey(actor)}${listText("reasons", reasons)}`,
    Lane: ({ kind, operation, attempt }) => `lane ${kind} ${operation} ${attemptText(attempt)}`,
    Reported: ({ code, record, reason }) =>
      `reported ${code}${Option.match(record, { onNone: () => "", onSome: (key) => ` ${key}` })}: ${reason}`,
    Issue: ({ code, ending }) =>
      `issue ${code}${Option.match(ending, {
        onNone: () => "",
        onSome: (e) => ` for ${e.operation} ${attemptText(e.attempt)} of ${actorKey(e.actor)}`,
      })}`,
    Incarnated: ({ actor }) => `incarnated ${actorKey(actor)}`,
    Finished: ({ actor }) => `finished ${actorKey(actor)}`,
    RuntimeDisposed: () => "runtime disposed",
    Published: ({ actor, state, memory }) =>
      `published ${actorKey(actor)} ${state} ${json(memory)}`,
  });

const recordText = (record: TraceRecord) =>
  TraceRecord.$match(record, {
    Step: ({ index, step }) => `step ${index} ${stepText(step)}`,
    Request: ({ server, endpoint, input, status }) =>
      `request ${server}.${endpoint} ${json(input)} ${status}`,
    Write: ({ purpose, keys, acknowledges, status }) =>
      `write ${purpose} [${keys.join(", ")}]${listText("acknowledges", acknowledges)} ${status}`,
    Runtime: ({ evidence }) => evidenceText(evidence),
  });

const renderers = {
  text: (trace: Trace) =>
    [
      `story ${trace.storyId}`,
      ...trace.events.map(
        (e) =>
          `${e.sequence.toString().padStart(4)} ${e.tab.name}:${e.tab.open} ${recordText(e.record)}`,
      ),
      "",
    ].join("\n"),
};

/**
 * Prints a trace.
 *
 * **When to use**
 *
 * To read what a Story run did, step by step, or to ask about a behaviour as two traces of one
 * Story.
 *
 * **Details**
 *
 * `"text"` prints a header naming the Story, then one line per event in sequence order: its
 * sequence, its tab as `name:open`, and the step with its arguments, the request with its server, endpoint,
 * input and status, the write with its purpose, keys and status, or the evidence record with its
 * fields. Two runs of one Story print the same text.
 *
 * @example
 * ```ts
 * const run = await story.run()
 * console.log(render(run.trace, "text"))
 * ```
 */
export const render = (trace: Trace, format: keyof typeof renderers) => renderers[format](trace);
