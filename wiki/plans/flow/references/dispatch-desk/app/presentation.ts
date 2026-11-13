// How the desk's Stories are presented (playback.md 6): captions, holds and routes per scene, typed against each
// Story's checkpoints. A presentation is data and never a source of events: the Story stays the only one. Each
// module's presentation plays the Story that holds its COVERAGE.md section 6 checkpoints.
//
// design gap: playback.md names `definePresentation` and `StoryPlayer` but not the module they come from; they are
// assumed to sit beside `StoryFrame` in "flow-state/testing".
// design gap: a presentation names one Story's checkpoints, so a module whose checkpoints span several Stories gets
// one presentation per Story; the desk tour is a list played in order by app/demo.tsx (no playlist exists).
import { definePresentation } from "flow-state/testing";
import { regenerated, streaming } from "../features/Assistant/assistant.story.js";
import { cleared, found, jumped, staleDropped } from "../features/Find/find.story.js";
import { joined, sdkResumed } from "../features/Presence/presence.story.js";
import { leftMidResolve, partsReleased, resolved } from "../features/Resolve/resolve.story.js";
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
import { dropAndCatchUp, historyTruncated } from "../features/Tickets/feed/feed.story.js";
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
} from "../features/Tickets/technicians/technicians.story.js";
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
    scenes: [{ at: "gaveUp", caption: 'After three tries it says so, and never says "not saved"' }],
    pacing,
  }),
  definePresentation(reopenedUnsure, {
    scenes: [
      { at: "closedWhileSaving", caption: "Close the ticket while it saves", route: queue },
      {
        at: "reopenedUnsure",
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
      { at: "typingSummary", caption: "Type the summary", route: ticket },
      {
        at: "summarySuperseded",
        caption: "Two pauses: the older value is replaced before it is ever sent",
      },
    ],
    pacing,
  }),
  definePresentation(bodyConflict, {
    scenes: [
      {
        at: "bodyConflict",
        caption: "Someone saved first: their text beside yours",
        hold: "1500 millis",
      },
    ],
    pacing,
  }),
  definePresentation(secondTab, {
    scenes: [{ at: "secondTab", caption: "A second tab: it works, without saving on this device" }],
    pacing,
  }),
  definePresentation(reloadedMidAutosave, {
    scenes: [
      {
        at: "reloadedMidAutosave",
        caption: "Reload mid-autosave: only what was sent is checked",
      },
    ],
    pacing,
  }),
  definePresentation(quotaRefused, {
    scenes: [
      {
        at: "quotaRefused",
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
      { at: "historyOpen", caption: "The History tab", route: ticket },
      { at: "frozen", caption: "Switch tabs: History is frozen, not thrown away" },
      { at: "thawed", caption: "Back: the same scroll, the same page" },
    ],
    pacing,
  }),
  definePresentation(reservationExpiredWhileAway, {
    scenes: [
      {
        at: "reservationExpiredWhileAway",
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
    scenes: [{ at: "toggledWhileUnsure", caption: "A toggle waits behind an unsure one" }],
    pacing,
  }),
  definePresentation(leftUnassigned, {
    scenes: [{ at: "leftUnassigned", caption: 'Assigned: it leaves "Unassigned" at once' }],
    pacing,
  }),
  definePresentation(bulkQueued, {
    scenes: [
      { at: "bulkQueued", caption: "Close fifty: queued in order", hold: "1200 millis" },
      { at: "bulkPartlyFailed", caption: "Three were refused; the other forty-seven closed" },
    ],
    pacing,
  }),
  definePresentation(slaBreached, {
    scenes: [{ at: "slaBreached", caption: "An SLA breaches while you watch" }],
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

// --- QU techs: "Who is free" ------------------------------------------------------------------

export const whoIsFree = [
  definePresentation(live, {
    scenes: [{ at: "techniciansLive", caption: "Technicians, live", route: queue }],
    pacing,
  }),
  definePresentation(stale, {
    scenes: [{ at: "technicianStale", caption: '"Seen 40 s ago": stale, not gone' }],
    pacing,
  }),
  definePresentation(pollerDown, {
    scenes: [{ at: "pollerDown", caption: "The poller is down: the panel says so" }],
    pacing,
  }),
  definePresentation(dispatched, {
    scenes: [
      { at: "dispatchedMovesColumn", caption: "Dispatch: the technician moves column at once" },
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
      { at: "tooShort", caption: "Too short: the reason under the box" },
      { at: "results", caption: "Results for the last thing typed" },
    ],
    pacing,
  }),
  definePresentation(staleDropped, {
    scenes: [{ at: "staleDropped", caption: "An older answer never arrives" }],
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
  // A fragment-alone Story (the wizard alone) is not playable by a presentation.
  definePresentation(resolved, { scenes: [{ at: "resolved", caption: "Resolved" }], pacing }),
  definePresentation(leftMidResolve, {
    scenes: [{ at: "leftMidResolve", caption: "Called away mid-resolve: the draft is kept" }],
    pacing,
  }),
  definePresentation(partsReleased, {
    scenes: [{ at: "partsReleased", caption: "Abandoned: the reserved parts go back" }],
    pacing,
  }),
];

// --- AD: "Merge two customers" ----------------------------------------------------------------------------------

export const mergeTwoCustomers = [
  definePresentation(movedTeam, {
    scenes: [
      {
        at: "movedTeam",
        caption: "Move a technician: both teams' counts change",
        route: "/desk/north/roster",
      },
    ],
    pacing,
  }),
  definePresentation(merged, {
    scenes: [
      { at: "comparing", caption: "Two customers, one person" },
      { at: "mergePredicted", caption: "Merged at once, on every screen", hold: "1200 millis" },
      { at: "merged", caption: "Confirmed" },
    ],
    pacing,
  }),
  definePresentation(mergeRefused, {
    scenes: [{ at: "mergeRefusedRestored", caption: "Refused: both come back, without a refetch" }],
    pacing,
  }),
  definePresentation(removeRefused, {
    scenes: [{ at: "removeRefusedRestored", caption: "A removal refused: the row comes back" }],
    pacing,
  }),
];

// --- PR, FE, AS: "Live desk" -------------------------------------------------------------------

export const liveDesk = [
  definePresentation(joined, {
    scenes: [{ at: "joined", caption: "Ben joins the ticket", route: ticket }],
    pacing,
  }),
  definePresentation(sdkResumed, {
    scenes: [{ at: "sdkResumed", caption: "The SDK reconnected: presence comes back" }],
    pacing,
  }),
  definePresentation(dropAndCatchUp, {
    scenes: [{ at: "caughtUp", caption: "The feed dropped and caught up from its cursor" }],
    pacing,
  }),
  definePresentation(historyTruncated, {
    scenes: [
      {
        at: "historyTruncated",
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
      { at: "deskOpen", caption: "The desk: queue and ticket", route: ticket },
      { at: "saving", caption: "One record, two screens" },
      { at: "saved", caption: "The queue repairs only what can be wrong" },
    ],
    pacing,
  }),
  // A fragment-alone Story (Comments alone) is not playable by a presentation.
  definePresentation(pushedRename, {
    scenes: [{ at: "pushedRename", caption: "Someone else renamed it: pushed" }],
    pacing,
  }),
  definePresentation(signOut, {
    scenes: [
      {
        at: "signOutRefused",
        caption: "Sign out with a save on the wire: the desk lists it first",
      },
    ],
    pacing,
  }),
];
