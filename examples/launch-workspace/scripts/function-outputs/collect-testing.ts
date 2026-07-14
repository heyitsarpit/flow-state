import * as flow from "flow-state";
import { storyToDoc } from "flow-state/inspect";
import {
  flowTest,
  formatHarnessTracePretty,
  formatPendingWorkPretty,
  formatScenarioTranscript,
  formatTransactionEventsPretty,
  runFlowScenario,
  scenarioToReport,
} from "flow-state/testing";

import {
  LaunchWorkspaceApp,
  launchWorkspaceMachine,
  launchWorkspaceStories,
} from "../../src/launchWorkspace";

import { scenarioOutcomeSummary, scenarioReportSummary } from "./output-summaries";
import type { OutputWriter } from "./output-writer";

function createTimerMachine(id: string) {
  return flow.machine<{ readonly ticks: number }, never, "waiting" | "done">({
    id,
    initial: "waiting",
    context: () => ({ ticks: 0 }),
    states: {
      waiting: {
        after: flow.after({
          id: `${id}.dismiss`,
          delay: "2 seconds",
          target: "done",
          update: ({ context }) => ({ ticks: context.ticks + 1 }),
        }),
      },
      done: {},
    },
  });
}

export async function collectTestingOutputs(writer: OutputWriter): Promise<void> {
  const overviewStory = launchWorkspaceStories.stories[0]!;
  const assistantStory = launchWorkspaceStories.stories[1]!;
  const overviewRun = await runFlowScenario(
    LaunchWorkspaceApp,
    launchWorkspaceMachine,
    overviewStory,
  );
  const assistantRun = await runFlowScenario(
    LaunchWorkspaceApp,
    launchWorkspaceMachine,
    assistantStory,
  );

  await writer.writeJson(
    "testing/flowStories.LaunchWorkspace.json",
    {
      kind: launchWorkspaceStories.kind,
      machineId: launchWorkspaceStories.machine.id,
      storyIds: launchWorkspaceStories.stories.map((story) => story.id),
      stories: launchWorkspaceStories.stories,
    },
    "testing",
    "flowStories",
    "Curated story registry attached to the Launch Workspace machine.",
  );
  await writer.writeJson(
    "testing/storyToDoc.overview-ready.json",
    storyToDoc(overviewStory),
    "testing",
    "storyToDoc",
    "Docs-friendly story descriptor for the ready overview story.",
  );
  await writer.writeJson(
    "testing/storyToDoc.assistant-running.json",
    storyToDoc(assistantStory),
    "testing",
    "storyToDoc",
    "Docs-friendly story descriptor for the assistant-running story.",
  );
  await writer.writeJson(
    "testing/runFlowScenario.overview-ready.json",
    scenarioOutcomeSummary(overviewRun),
    "testing",
    "runFlowScenario",
    "Runnable story outcome for the ready overview story.",
  );
  await writer.writeJson(
    "testing/runFlowScenario.assistant-running.json",
    scenarioOutcomeSummary(assistantRun),
    "testing",
    "runFlowScenario",
    "Runnable story outcome for the assistant-running story.",
  );
  await writer.writeJson(
    "testing/scenarioToReport.overview-ready.json",
    scenarioReportSummary(scenarioToReport(overviewRun)),
    "testing",
    "scenarioToReport",
    "Story-backed test report for the ready overview story.",
  );
  await writer.writeJson(
    "testing/scenarioToReport.assistant-running.json",
    scenarioReportSummary(scenarioToReport(assistantRun)),
    "testing",
    "scenarioToReport",
    "Story-backed test report for the assistant-running story.",
  );

  const timerHarness = flowTest(createTimerMachine("launch-workspace.eval.timer")).start();
  const harnessTrace = timerHarness.captureTrace();
  await writer.writeText(
    "testing/formatPendingWorkPretty.txt",
    formatPendingWorkPretty(timerHarness.pendingWork()),
    "testing",
    "formatPendingWorkPretty",
    "Readable snapshot of pending harness timers/mailbox state.",
  );
  await writer.writeText(
    "testing/formatHarnessTracePretty.txt",
    formatHarnessTracePretty(harnessTrace),
    "testing",
    "formatHarnessTracePretty",
    "Readable harness trace summary.",
  );
  await writer.writeText(
    "testing/formatScenarioTranscript.txt",
    formatScenarioTranscript(harnessTrace.receipts),
    "testing",
    "formatScenarioTranscript",
    "Scenario-style receipt transcript from a tiny timer harness.",
  );
  await writer.writeText(
    "testing/formatTransactionEventsPretty.txt",
    formatTransactionEventsPretty([
      {
        type: "transaction:start",
        id: "launch.save",
        parentState: "editing",
      },
      {
        type: "transaction:success",
        id: "launch.save",
        parentState: "editing",
      },
    ]),
    "testing",
    "formatTransactionEventsPretty",
    "Readable transaction receipt list formatting.",
  );
}
