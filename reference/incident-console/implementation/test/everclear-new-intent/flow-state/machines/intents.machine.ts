import * as flow from "flow-state";
import {
  emptyIntentsMemory,
  listQueryFrom,
  makeFiltersUrlQuery,
  type ExplorerFailure,
  type IntentFilters,
} from "../domain";
import { addressLabels, intentPage, runtimeInput, writeFiltersUrl } from "../primitives";

export const Intents = flow.definition({
  id: "Everclear/Intents",
  states: ["INACTIVE", "BROWSING", "REFRESHING"],
  events: {
    RouteEntered: (filters: IntentFilters) => ({ filters }),
    RouteLeft: null,
    FiltersChanged: (filters: IntentFilters) => ({ filters }),
    NextPageRequested: (cursor: string) => ({ cursor }),
    PreviousPageRequested: null,
    RefreshRequested: null,
    RefreshFinished: null,
    RefreshFailed: (error: ExplorerFailure) => ({ error }),
  },
  memory: emptyIntentsMemory,
  operations: { intentPage, addressLabels, writeFiltersUrl },
});

export const intentsMachine = flow.machine(Intents, ({ S, E, O, onMemory }) => {
  const pageActivity = onMemory(({ memory }) => O.intentPage.subscribe(listQueryFrom(memory)));

  const navigation = {
    FiltersChanged: {
      target: S.BROWSING,
      updateMemory: ({ memory, event }) => ({
        filters: event.filters,
        cursor: null,
        cursorHistory: [],
        previousQuery: listQueryFrom(memory),
      }),
      actions: ({ event }) => [
        O.writeFiltersUrl.commit({
          query: makeFiltersUrlQuery(event.filters),
        }),
      ],
    },
    NextPageRequested: {
      target: S.BROWSING,
      updateMemory: ({ memory, event }) => ({
        cursor: event.cursor,
        cursorHistory: [...memory.cursorHistory, memory.cursor],
        previousQuery: listQueryFrom(memory),
      }),
    },
    PreviousPageRequested: {
      target: S.BROWSING,
      guard: ({ memory }) => memory.cursorHistory.length > 0,
      updateMemory: ({ memory }) => ({
        cursor: memory.cursorHistory.at(-1) ?? null,
        cursorHistory: memory.cursorHistory.slice(0, -1),
        previousQuery: listQueryFrom(memory),
      }),
    },
  };

  return {
    default: S.INACTIVE,
    states: {
      INACTIVE: {
        on: {
          RouteEntered: {
            target: S.BROWSING,
            updateMemory: ({ event }) => ({
              filters: event.filters,
              cursor: null,
              cursorHistory: [],
              previousQuery: null,
              refreshError: null,
            }),
          },
        },
      },
      BROWSING: {
        activities: [pageActivity, O.addressLabels.subscribe(runtimeInput)],
        on: {
          ...navigation,
          RouteLeft: { target: S.INACTIVE },
          RefreshRequested: {
            target: S.REFRESHING,
            actions: ({ memory }) => [
              O.intentPage.refetch(listQueryFrom(memory), {
                outcomes: {
                  success: () => E.RefreshFinished(),
                  failure: (error) => E.RefreshFailed(error),
                },
              }),
            ],
          },
        },
        timers: { poll: { delay: "60 seconds", target: S.REFRESHING } },
      },
      REFRESHING: {
        activities: [pageActivity, O.addressLabels.subscribe(runtimeInput)],
        on: {
          ...navigation,
          RouteLeft: { target: S.INACTIVE },
          RefreshFinished: {
            target: S.BROWSING,
            updateMemory: () => ({ refreshError: null, previousQuery: null }),
          },
          RefreshFailed: {
            target: S.BROWSING,
            updateMemory: ({ event }) => ({ refreshError: event.error }),
          },
        },
      },
    },
  };
});
