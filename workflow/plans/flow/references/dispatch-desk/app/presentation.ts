// How the desk's Stories are presented (playback.md 6): captions, holds and routes per scene, typed against each
// Story's checkpoints. A presentation is data and never a source of events: the Story stays the only one. Each
// module's presentation plays the Story that holds its COVERAGE.md section 6 checkpoints.
//
// design gap: playback.md names `definePresentation` and `StoryPlayer` but not the module they come from; they are
// assumed to sit beside `StoryFrame` in "flow-state/testing".
// design gap: a presentation names one Story's checkpoints, so a module whose checkpoints span several Stories gets
// one presentation per Story; the desk tour is a list played in order by app/demo.tsx (no playlist exists).
import { definePresentation } from "flow-state/testing";
import { regenerated, streaming } from "../features/Assistant/assistant.story.js"; // pending merge 6
import { deleteRefused, pinned, postedInOrder } from "../features/Comments/comments.story.js";
import { cleared, found, jumped, staleDropped } from "../features/Find/find.story.js";
import { joined, sdkResumed } from "../features/Presence/presence.story.js"; // pending merge 6
import {
  leftMidResolve,
  partsReleased,
  resolved,
  wizardAlone,
} from "../features/Resolve/resolve.story.js";
import { merged, mergeRefused, movedTeam, removeRefused } from "../features/Roster/roster.story.js";
import { pushedRename, saveRepairsQueue, signOut } from "../features/Tickets/desk.story.js";
import {
  reloadedMidAutosave,
  secondTab,
  quotaRefused,
} from "../features/Tickets/editor/editor.tabs.story.js";
import {
  reopenedUnsure,
  saved,
  unsureGaveUp,
  unsureResend,
} from "../features/Tickets/editor/editor.story.js";
import { bodyConflict, summarySuperseded } from "../features/Tickets/editor/fields.story.js";
import { dropAndCatchUp, historyTruncated } from "../features/Tickets/feed/feed.story.js"; // pending merge 6
import {
  frozenAndThawed,
  reservationExpiredWhileAway,
} from "../features/Tickets/panels/panels.story.js";
import { bulkQueued, slaBreached } from "../features/Tickets/queue/queue.bulk.story.js";
import {
  archived,
  created,
  filtered,
  leftUnassigned,
  toggled,
  toggledWhileUnsure,
} from "../features/Tickets/queue/queue.story.js";
import {
  dispatched,
  live,
  nudged,
  pollerDown,
  stale,
} from "../features/Tickets/technicians/technicians.story.js"; // pending merge 6

const ticket = "/desk/north/T-42";

const queue = "/desk/north";

const pacing = { speed: 1, maxWait: "800 millis", minDwell: "120 millis" } as const;

// --- ED title: "The save you can't lose" -----------------------------------------------------------------------

export const saveYouCantLose = [
  definePresentation(saved, {
    scenes: [
      { at: "draft", caption: "Type a new title", route: ticket },
      {
        at: "saving",
        caption: "Saving: the title shows in the queue at once",
        hold: "1200 millis",
      },
    ],
    pacing,
  }),
  definePresentation(unsureResend, {
    scenes: [
      {
        at: "unsure",
        caption: "The answer was lost. The editor keeps the same save",
        hold: "1500 millis",
      },
      { at: "resending", caption: "It sends the SAME save again; the server dedups it by its key" },
    ],
    pacing,
  }),
  definePresentation(unsureGaveUp, {
    scenes: [
      { at: "gave-up", caption: 'After three tries it says so, and never says "not saved"' },
    ],
    pacing,
  }),
  definePresentation(reopenedUnsure, {
    scenes: [
      { at: "closed-while-saving", caption: "Close the ticket while it saves", route: queue },
      {
        at: "reopened-unsure",
        caption: "Reopen it: the save is still being checked",
        route: ticket,
      },
    ],
    pacing,
  }),
];

// --- ED fields and tabs: "Two tabs, one ticket" (app/demo.tsx renders tab a and tab b side by side, X2) ----------

export const twoTabsOneTicket = [
  definePresentation(summarySuperseded, {
    scenes: [
      { at: "typing-summary", caption: "Type the summary", route: ticket },
      {
        at: "summary-superseded",
        caption: "Two pauses: the older value is replaced before it is ever sent",
      },
    ],
    pacing,
  }),
  definePresentation(bodyConflict, {
    scenes: [
      {
        at: "body-conflict",
        caption: "Someone saved first: their text beside yours",
        hold: "1500 millis",
      },
    ],
    pacing,
  }),
  definePresentation(secondTab, {
    scenes: [
      { at: "second-tab", caption: "A second tab: it works, without saving on this device" },
    ],
    pacing,
  }),
  definePresentation(reloadedMidAutosave, {
    scenes: [
      {
        at: "reloaded-mid-autosave",
        caption: "Reload mid-autosave: only what was sent is checked",
      },
    ],
    pacing,
  }),
  definePresentation(quotaRefused, {
    scenes: [
      {
        at: "quota-refused",
        caption: "The device is full: nothing was sent, the field stays dirty",
      },
    ],
    pacing,
  }),
];

// --- ED panels: "Panels remember" ------------------------------------------------------------------------------

export const panelsRemember = [
  definePresentation(frozenAndThawed, {
    scenes: [
      { at: "history-open", caption: "The History tab", route: ticket },
      { at: "frozen", caption: "Switch tabs: History is frozen, not thrown away" },
      { at: "thawed", caption: "Back: the same scroll, the same page" },
    ],
    pacing,
  }),
  definePresentation(reservationExpiredWhileAway, {
    scenes: [
      {
        at: "reservation-expired-while-away",
        caption: "The parts hold ran out while you were away; it fires once",
      },
    ],
    pacing,
  }),
];

// --- QU: "Bulk close fifty tickets" -----------------------------------------------------------------------------

export const bulkCloseFifty = [
  definePresentation(filtered, {
    scenes: [{ at: "filtered", caption: "Triage: unassigned, newest first", route: queue }],
    pacing,
  }),
  definePresentation(toggled, {
    scenes: [{ at: "toggled", caption: "Assign, unassign, assign: two requests, batched" }],
    pacing,
  }),
  definePresentation(toggledWhileUnsure, {
    scenes: [{ at: "toggled-while-unsure", caption: "A toggle waits behind an unsure one" }],
    pacing,
  }),
  definePresentation(leftUnassigned, {
    scenes: [{ at: "left-unassigned", caption: 'Assigned: it leaves "Unassigned" at once' }],
    pacing,
  }),
  definePresentation(bulkQueued, {
    scenes: [
      { at: "bulk-queued", caption: "Close fifty: queued in order", hold: "1200 millis" },
      { at: "bulk-partly-failed", caption: "Three were refused; the other forty-seven closed" },
    ],
    pacing,
  }),
  definePresentation(slaBreached, {
    scenes: [{ at: "sla-breached", caption: "An SLA breaches while you watch" }],
    pacing,
  }),
  definePresentation(created, {
    scenes: [{ at: "created", caption: "A new ticket joins the list before the server answers" }],
    pacing,
  }),
  definePresentation(archived, {
    scenes: [{ at: "archived", caption: "Archived: it leaves the list" }],
    pacing,
  }),
];

// --- QU techs: "Who is free" (pending merge 6) ------------------------------------------------------------------

export const whoIsFree = [
  definePresentation(live, {
    scenes: [{ at: "technicians-live", caption: "Technicians, live", route: queue }],
    pacing,
  }),
  definePresentation(stale, {
    scenes: [{ at: "technician-stale", caption: '"Seen 40 s ago": stale, not gone' }],
    pacing,
  }),
  definePresentation(pollerDown, {
    scenes: [{ at: "poller-down", caption: "The poller is down: the panel says so" }],
    pacing,
  }),
  definePresentation(dispatched, {
    scenes: [
      { at: "dispatched-moves-column", caption: "Dispatch: the technician moves column at once" },
    ],
    pacing,
  }),
  definePresentation(nudged, { scenes: [{ at: "nudged", caption: "Nudged" }], pacing }),
];

// --- FD: "Find anything" ----------------------------------------------------------------------------------------

export const findAnything = [
  definePresentation(found, {
    scenes: [
      { at: "typing", caption: "Type in the palette", route: queue },
      { at: "too-short", caption: "Too short: the reason under the box" },
      { at: "results", caption: "Results for the last thing typed" },
    ],
    pacing,
  }),
  definePresentation(staleDropped, {
    scenes: [{ at: "stale-dropped", caption: "An older answer never arrives" }],
    pacing,
  }),
  definePresentation(cleared, {
    scenes: [{ at: "cleared", caption: "Clear the box: the lookup is cancelled" }],
    pacing,
  }),
  definePresentation(jumped, { scenes: [{ at: "jumped", caption: "Jump to the ticket" }], pacing }),
];

// --- RW: "Resolve on site" (the next-action highlight reaches into the nested ConfirmDiscard, X4) ---------------

export const resolveOnSite = [
  definePresentation(wizardAlone, {
    scenes: [
      { at: "reason", caption: "Why was it resolved?", route: `${ticket}/visit` },
      { at: "parts", caption: "Parts used: each one looked up" },
      { at: "back-to-reason", caption: "Back" },
      {
        at: "confirm-discard",
        caption: "Cancel asks first: the dialog is inside the wizard",
        hold: "1200 millis",
      },
    ],
    pacing,
  }),
  definePresentation(resolved, { scenes: [{ at: "resolved", caption: "Resolved" }], pacing }),
  definePresentation(leftMidResolve, {
    scenes: [{ at: "left-mid-resolve", caption: "Called away mid-resolve: the draft is kept" }],
    pacing,
  }),
  definePresentation(partsReleased, {
    scenes: [{ at: "parts-released", caption: "Abandoned: the reserved parts go back" }],
    pacing,
  }),
];

// --- AD: "Merge two customers" ----------------------------------------------------------------------------------

export const mergeTwoCustomers = [
  definePresentation(movedTeam, {
    scenes: [
      {
        at: "moved-team",
        caption: "Move a technician: both teams' counts change",
        route: "/desk/north/roster",
      },
    ],
    pacing,
  }),
  definePresentation(merged, {
    scenes: [
      { at: "comparing", caption: "Two customers, one person" },
      { at: "merge-predicted", caption: "Merged at once, on every screen", hold: "1200 millis" },
      { at: "merged", caption: "Confirmed" },
    ],
    pacing,
  }),
  definePresentation(mergeRefused, {
    scenes: [
      { at: "merge-refused-restored", caption: "Refused: both come back, without a refetch" },
    ],
    pacing,
  }),
  definePresentation(removeRefused, {
    scenes: [{ at: "remove-refused-restored", caption: "A removal refused: the row comes back" }],
    pacing,
  }),
];

// --- PR, FE, AS: "Live desk" (pending merge 6) -------------------------------------------------------------------

export const liveDesk = [
  definePresentation(joined, {
    scenes: [{ at: "joined", caption: "Ben joins the ticket", route: ticket }],
    pacing,
  }),
  definePresentation(sdkResumed, {
    scenes: [{ at: "sdk-resumed", caption: "The SDK reconnected: presence comes back" }],
    pacing,
  }),
  definePresentation(dropAndCatchUp, {
    scenes: [{ at: "caught-up", caption: "The feed dropped and caught up from its cursor" }],
    pacing,
  }),
  definePresentation(historyTruncated, {
    scenes: [
      {
        at: "history-truncated",
        caption: "Too far behind: the feed says it missed some, and reloads",
      },
    ],
    pacing,
  }),
  definePresentation(streaming, {
    scenes: [{ at: "streaming", caption: "The assistant writes as it thinks" }],
    pacing,
  }),
  definePresentation(regenerated, {
    scenes: [{ at: "regenerated", caption: "Regenerate interrupts the old reply" }],
    pacing,
  }),
];

// --- DD app: the desk tour (gaps shown, X5) ----------------------------------------------------------------------

export const deskTour = [
  definePresentation(saveRepairsQueue, {
    scenes: [
      { at: "desk-open", caption: "The desk: queue and ticket", route: ticket },
      { at: "saving", caption: "One record, two screens" },
      { at: "saved", caption: "The queue repairs only what can be wrong" },
    ],
    pacing,
  }),
  definePresentation(postedInOrder, {
    scenes: [{ at: "posted-in-order", caption: "Comments land in the order they were written" }],
    pacing,
  }),
  definePresentation(deleteRefused, {
    scenes: [{ at: "delete-refused-restored", caption: "A refused delete comes back" }],
    pacing,
  }),
  definePresentation(pinned, {
    scenes: [{ at: "pinned", caption: "Pinned: it joins the strip at once" }],
    pacing,
  }),
  definePresentation(pushedRename, {
    scenes: [{ at: "pushed-rename", caption: "Someone else renamed it: pushed" }],
    pacing,
  }), // pending merge 6
  definePresentation(signOut, {
    scenes: [
      {
        at: "sign-out-refused",
        caption: "Sign out with a save on the wire: the desk lists it first",
      },
    ],
    pacing,
  }),
];
