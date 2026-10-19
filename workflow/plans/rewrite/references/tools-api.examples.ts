// Supporting final-target consumer syntax; not compiled or run for this proposal.
// Normative API, types, behavior, exclusions, and checks live in the owning Plans.
// PackageContract controls testing/inspect route restoration.

import { Result } from "effect";
import { app, definition, machine, module, runtimeSetup } from "flow-state";
import { behavior, story } from "flow-state/testing";

const Editor = definition({
  id: "Examples/StoryEditor",
  states: ["READY"],
  events: {
    Opened: "bare",
    SaveRequested: "bare",
    Discarded: "bare",
    Cancelled: "bare",
  },
  memory: () => ({ edits: 0 }),
});

const EditorMachine = machine(Editor, ({ S }) => ({
  default: S.READY,
  states: {
    READY: {
      on: {
        Opened: { target: S.READY },
        SaveRequested: { target: S.READY },
        Discarded: { target: S.READY },
        Cancelled: { target: S.READY },
      },
    },
  },
}));

if (Result.isSuccess(Editor) && Result.isSuccess(EditorMachine)) {
  const opened = Editor.success.E.Opened();
  const saveRequested = Editor.success.E.SaveRequested();
  const discarded = Editor.success.E.Discarded();
  const cancelled = Editor.success.E.Cancelled();

  if (
    Result.isSuccess(opened) &&
    Result.isSuccess(saveRequested) &&
    Result.isSuccess(discarded) &&
    Result.isSuccess(cancelled)
  ) {
    // persistent-branches
    const common = story.machine(EditorMachine.success)
      .send(opened.success)
      .process()
      .checkpoint("opened");
    const saved = common.send(saveRequested.success).process().checkpoint("saved");
    const abandoned = common.send(discarded.success).checkpoint("discarded");
    const stopped = common.send(cancelled.success).checkpoint("cancelled");
    const savedRun = await saved.run();
    const abandonedRun = await abandoned.run();
    savedRun.checkpoints.opened;
    savedRun.checkpoints.saved;
    abandonedRun.checkpoints.discarded;
    // @ts-expect-error unknown checkpoint
    savedRun.checkpoints.typo;
    // @ts-expect-error duplicate checkpoint
    common.checkpoint("opened");

    const ExampleApp = app({
      id: "story-examples",
      persistenceVersion: "1",
      modules: [module({ id: "editor", machines: { editor: EditorMachine.success } })],
    });
    const setup = runtimeSetup({ app: ExampleApp });
    const editor = story.actor(EditorMachine.success);
    const appStory = story.app(setup).send(editor, opened.success).checkpoint("opened");

    // evidence-reads
    const appRun = await appStory.run();
    appRun.checkpoints.opened.actor(editor).snapshot;
    appRun.checkpoints.opened.runtime.now;
    appRun.checkpoints.opened.runtime.pendingWork;
    appRun.end.actor(editor).snapshot;
    savedRun.checkpoints.saved.snapshot;
    savedRun.end.runtime.pendingWork;

    // model-paths
    // stateKey's exact snapshot member names remain unresolved; see StoriesAndModels.Q4.

    // behavior-gateway
    const gateway = behavior({
      app: ExampleApp,
      stories: { smoke: appStory, "machine-model": story.machine(EditorMachine.success) },
    });
  }
}
