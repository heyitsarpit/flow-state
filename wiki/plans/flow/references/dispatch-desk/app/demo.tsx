"use client";

// A development page: one `StoryPlayer` per presentation (playback.md 6). The player records the presentation's
// Story once on mount, on the production Runtime with the Story's fixtures, and then only renders frames: no Flow
// work runs while someone watches. The app is rendered BELOW its FlowProvider (the player supplies the Flow context),
// so `Desk` here is the screen alone, not `renderDesk`.
//
// What the player shows beyond the app:
//   - next action: the control whose click would send the Story's next event is highlighted, including a keyed
//     copy's ("Save" in the summary field's Autosave) and a nested subroutine's ("Discard" in ConfirmDiscard, X4);
//   - Inspect: the frame's cause, the run's evidence, and its gaps, the actors a frame lacks (X5), which the desk
//     tour shows on purpose (its Stories ensure no toasts actor in the tour's first scene).
//
// design gap: `StoryPlayer`'s `onEnded` (to play the next presentation of a list) is not in playback.md; a list is
// played here by keeping an index in React state and keying the player.
import { useState } from "react";
import { StoryFrame, StoryPlayer } from "flow-state/testing";
import { TicketPanel } from "../features/Tickets/editor/TicketPanel.js";
import { T42 } from "../features/Tickets/editor/editor.story.js";
import { secondTab } from "../features/Tickets/editor/editor.tabs.story.js";
import {
  bulkCloseFifty,
  deskTour,
  findAnything,
  liveDesk,
  mergeTwoCustomers,
  panelsRemember,
  resolveOnSite,
  saveYouCantLose,
  twoTabsOneTicket,
  whoIsFree,
} from "./presentation.js";
import { Desk } from "./view.js";

const demos = {
  "The desk tour": deskTour,
  "The save you can't lose": saveYouCantLose,
  "Two tabs, one ticket": twoTabsOneTicket,
  "Panels remember": panelsRemember,
  "Bulk close fifty tickets": bulkCloseFifty,
  "Who is free": whoIsFree,
  "Find anything": findAnything,
  "Resolve on site": resolveOnSite,
  "Merge two customers": mergeTwoCustomers,
  "Live desk": liveDesk,
} as const;

type Demo = keyof typeof demos;

export function DeskDemo() {
  const [demo, setDemo] = useState<Demo>("The desk tour");
  const [scene, setScene] = useState(0);
  const list = demos[demo];
  const presentation = list[scene] ?? list[0]!;

  return (
    <main>
      <nav aria-label="Demos">
        {(Object.keys(demos) as Demo[]).map((name) => (
          <button
            key={name}
            aria-current={name === demo}
            onClick={() => (setDemo(name), setScene(0))}
          >
            {name}
          </button>
        ))}
      </nav>
      <StoryPlayer key={`${demo}/${scene}`} presentation={presentation}>
        <Desk userId="dispatcher-7" />
      </StoryPlayer>
      <button disabled={scene + 1 >= list.length} onClick={() => setScene(scene + 1)}>
        Next part
      </button>
      {demo === "Two tabs, one ticket" && <TwoTabs />}
    </main>
  );
}

// Two tabs side by side at one checkpoint (X2): the same run, one frame, each tab's Runtime rendered.
function TwoTabs() {
  const [run, setRun] = useState<Awaited<ReturnType<typeof secondTab.run>> | null>(null);

  if (run === null)
    return <button onClick={() => void secondTab.run().then(setRun)}>Show both tabs</button>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <StoryFrame run={run} checkpoint="b-saving" tab="main">
        <TicketPanel ticket={T42} />
      </StoryFrame>
      <StoryFrame run={run} checkpoint="b-saving" tab="b">
        <TicketPanel ticket={T42} />
      </StoryFrame>
    </div>
  );
}
