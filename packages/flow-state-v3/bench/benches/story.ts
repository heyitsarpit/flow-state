import { Option } from "effect";
import type { Story } from "../../src/host/testing/index.ts";
import type { Subject } from "../declare.ts";
import { storyById } from "../stories.ts";
import { timeStory, type TurnRecord } from "../time.ts";

const turnText = (t: TurnRecord) => `${t.event}:${t.from}>${t.to}:${t.parts.length}`;

/**
 * A Story as a bench subject: one operation is one `run()`, its unit a turn.
 *
 * **Details**
 *
 * The proof runs the Story as a test does and checks a timed run did the same turns in the same
 * order. The shape is the work the fixture asks for: the tested run's steps, turns and actors. Record
 * bytes are left out, since the runtime's own encoding changes them; the `persist` benches count them.
 */
export const storySubject = async (story: Story<string>) => {
  const tested = await story.run();
  const turns = tested.evidence.filter((e) => e._tag === "Turn");

  const subject: Subject = {
    op: async () => {
      const [run] = await timeStory(story, 1);

      return {
        units: Math.max(1, run?.turns.length ?? 0),
        counters: {
          turns: run?.turns.length ?? 0,
          evidence: run?.evidence ?? 0,
          sent: run?.sent ?? 0,
        },
        sample: Option.none(),
      };
    },
    proof: async () => {
      const [timed] = await timeStory(story, 1);
      const got = (timed?.turns ?? []).map(turnText).join("\n");
      const want = turns.map(turnText).join("\n");

      return got === want && turns.length > 0
        ? Option.none()
        : Option.some(
            `${story.id}: a timed run did ${timed?.turns.length ?? 0} turns, the tested run ${turns.length}`,
          );
    },
    shape: {
      steps: story.steps.length,
      turns: turns.length,
      actors: tested.end.inspection.actors.length,
    },
  };

  return subject;
};

/**
 * The subject of the fixture Story with this id, failing when no Story file exports it.
 */
export const storyNamed = async (id: string) =>
  storySubject(
    Option.getOrThrowWith(
      await storyById(id),
      () => new Error(`no fixture Story has the id ${id}`),
    ),
  );
