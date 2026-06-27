import { flow } from "@flow-state/core";
import type { FlowEvent, FlowSnapshot, FlowTag, FlowTransitionArgs } from "@flow-state/core";

import { dashboardApi } from "./dashboardApi";

export type DashboardPanelId = "stats" | "revenue" | "alerts";
export type DashboardState = "active" | "saving" | "failure" | "defect";
export type DashboardFreshness = "loading" | "fresh" | "stale" | "failure" | "idle";

export interface DashboardPanelPayload {
  readonly panelId: DashboardPanelId;
  readonly title: string;
  readonly value: string;
  readonly summary: string;
  readonly updatedAt: number;
}

export interface DashboardPanel {
  readonly id: DashboardPanelId;
  readonly title: string;
  readonly tags: readonly FlowTag[];
  readonly staleTime: number;
}

export interface DashboardPanelView {
  readonly id: DashboardPanelId;
  readonly title: string;
  readonly value: string;
  readonly summary: string;
  readonly freshness: DashboardFreshness;
  readonly lastRequestId: number | null;
  readonly updatedAt: number | null;
  readonly invalidatedAt: number | null;
  readonly error: DashboardSaveError | null;
}

export interface PendingWidgetDraft {
  readonly widgetId: string;
  readonly title: string;
  readonly targetPanel: DashboardPanelId;
}

export interface WidgetUpdateInput {
  readonly tenantId: string;
  readonly widgetId: string;
  readonly title: string;
  readonly targetPanel: DashboardPanelId;
}

export interface WidgetUpdateResult {
  readonly ok: true;
  readonly widgetId: string;
  readonly targetPanel: DashboardPanelId;
  readonly savedTitle: string;
  readonly savedAt: number;
}

export type DashboardSaveError =
  | {
      readonly _tag: "PanelUnavailable";
      readonly panelId: DashboardPanelId;
      readonly message: string;
    }
  | {
      readonly _tag: "WidgetValidation";
      readonly field: "title";
      readonly message: string;
    };

export type DashboardIssue =
  | {
      readonly kind: "failure";
      readonly source: "query" | "mutation";
      readonly requestId: number;
      readonly panelId?: DashboardPanelId;
      readonly error: DashboardSaveError;
      readonly handled: true;
    }
  | {
      readonly kind: "defect";
      readonly requestId: number;
      readonly defect: unknown;
      readonly handled: false;
    }
  | {
      readonly kind: "interrupt";
      readonly source: "query" | "mutation";
      readonly requestId: number;
      readonly panelId?: DashboardPanelId;
      readonly handled: true;
    };

export interface DashboardContext {
  readonly tenantId: string;
  readonly panels: Readonly<Record<DashboardPanelId, DashboardPanelView>>;
  readonly pendingWidget: PendingWidgetDraft | null;
  readonly lastSavedWidget: WidgetUpdateResult | null;
  readonly currentIssue: DashboardIssue | null;
}

export type DashboardEvent =
  | ({ readonly type: "REFRESH_DASHBOARD" } & FlowEvent)
  | ({
      readonly type: "PANEL_LOADED";
      readonly requestId: number;
      readonly panelId: DashboardPanelId;
      readonly payload: DashboardPanelPayload;
    } & FlowEvent)
  | ({
      readonly type: "PANEL_FAILED";
      readonly requestId: number;
      readonly panelId: DashboardPanelId;
      readonly error: DashboardSaveError;
    } & FlowEvent)
  | ({
      readonly type: "PANEL_INTERRUPTED";
      readonly requestId: number;
      readonly panelId: DashboardPanelId;
    } & FlowEvent)
  | ({
      readonly type: "EDIT_WIDGET";
      readonly widgetId: string;
      readonly title: string;
      readonly targetPanel: DashboardPanelId;
    } & FlowEvent)
  | ({ readonly type: "SAVE_WIDGET" } & FlowEvent)
  | ({
      readonly type: "WIDGET_SAVED";
      readonly requestId: number;
      readonly result: WidgetUpdateResult;
    } & FlowEvent)
  | ({
      readonly type: "WIDGET_SAVE_FAILED";
      readonly requestId: number;
      readonly error: DashboardSaveError;
    } & FlowEvent)
  | ({
      readonly type: "WIDGET_SAVE_INTERRUPTED";
      readonly requestId: number;
    } & FlowEvent)
  | ({
      readonly type: "DASHBOARD_DEFECT";
      readonly requestId: number;
      readonly defect: unknown;
    } & FlowEvent)
  | ({ readonly type: "MARK_STALE_FROM_CACHE" } & FlowEvent)
  | ({ readonly type: "DISMISS_ISSUE" } & FlowEvent);

export type DashboardSnapshot = FlowSnapshot<DashboardContext, DashboardState>;
type DashboardArgs = FlowTransitionArgs<DashboardContext, DashboardEvent, DashboardState>;

const submitWidget = flow.submit<DashboardContext, DashboardEvent, DashboardState>(
  dashboardApi.updateWidget,
  { target: "saving", guard: canSaveWidget },
);

export const dashboardMachine = flow.machine<DashboardContext, DashboardEvent, DashboardState>({
  id: "example-3-cached-dashboard",
  initial: "active",
  context: createInitialContext,
  states: {
    active: {
      invoke: dashboardApi.panels,
      on: {
        REFRESH_DASHBOARD: {
          target: "active",
          update: markPanelsLoading,
        },
        PANEL_LOADED: {
          update: loadPanel,
        },
        PANEL_FAILED: {
          target: "failure",
          update: failPanel,
        },
        PANEL_INTERRUPTED: {
          target: "failure",
          update: interruptPanel,
        },
        EDIT_WIDGET: {
          update: editWidget,
        },
        SAVE_WIDGET: submitWidget,
        MARK_STALE_FROM_CACHE: {
          update: markPanelsStale,
        },
        DISMISS_ISSUE: {
          update: dismissIssue,
        },
        DASHBOARD_DEFECT: {
          target: "defect",
          update: defectDashboard,
        },
      },
    },
    saving: {
      on: {
        WIDGET_SAVED: {
          target: "active",
          update: finishWidgetSave,
        },
        WIDGET_SAVE_FAILED: {
          target: "failure",
          update: failWidgetSave,
        },
        WIDGET_SAVE_INTERRUPTED: {
          target: "failure",
          update: interruptWidgetSave,
        },
        DASHBOARD_DEFECT: {
          target: "defect",
          update: defectDashboard,
        },
      },
    },
    failure: {
      on: {
        REFRESH_DASHBOARD: {
          target: "active",
          update: markPanelsLoading,
        },
        EDIT_WIDGET: {
          update: editWidget,
        },
        SAVE_WIDGET: {
          ...submitWidget,
          guard: canSaveWidget,
        },
        DISMISS_ISSUE: {
          target: "active",
          update: dismissIssue,
        },
      },
    },
    defect: {
      on: {
        REFRESH_DASHBOARD: {
          target: "active",
          update: markPanelsLoading,
        },
      },
    },
  },
});

export function selectPanelList(context: DashboardContext): readonly DashboardPanelView[] {
  return [context.panels.stats, context.panels.revenue, context.panels.alerts];
}

export function selectDashboardSummary(context: DashboardContext): {
  readonly fresh: number;
  readonly stale: number;
  readonly loading: number;
  readonly failures: number;
} {
  return selectPanelList(context).reduce(
    (summary, panel) => ({
      fresh: summary.fresh + (panel.freshness === "fresh" ? 1 : 0),
      stale: summary.stale + (panel.freshness === "stale" ? 1 : 0),
      loading: summary.loading + (panel.freshness === "loading" ? 1 : 0),
      failures: summary.failures + (panel.freshness === "failure" ? 1 : 0),
    }),
    { fresh: 0, stale: 0, loading: 0, failures: 0 },
  );
}

export function selectCanSaveWidget(context: DashboardContext): boolean {
  return context.pendingWidget !== null && normalize(context.pendingWidget.title).length > 0;
}

export function statusLabel(snapshot: DashboardSnapshot): string {
  if (snapshot.value === "saving") {
    return "saving widget";
  }

  const summary = selectDashboardSummary(snapshot.context);
  if (summary.failures > 0) {
    return "panel failure";
  }

  if (summary.stale > 0) {
    return "stale cache";
  }

  if (summary.loading > 0) {
    return "loading panels";
  }

  return "fresh";
}

function createInitialContext(): DashboardContext {
  return {
    tenantId: "tenant-north",
    panels: {
      stats: emptyPanel("stats", "KPI strip"),
      revenue: emptyPanel("revenue", "Revenue"),
      alerts: emptyPanel("alerts", "Alerts"),
    },
    pendingWidget: {
      widgetId: "widget-forecast",
      title: "Forecast module",
      targetPanel: "revenue",
    },
    lastSavedWidget: null,
    currentIssue: null,
  };
}

function emptyPanel(id: DashboardPanelId, title: string): DashboardPanelView {
  return {
    id,
    title,
    value: "pending",
    summary: "Waiting for query runtime.",
    freshness: "idle",
    lastRequestId: null,
    updatedAt: null,
    invalidatedAt: null,
    error: null,
  };
}

function loadPanel({ context, event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "PANEL_LOADED") {
    return {};
  }

  return {
    panels: {
      ...context.panels,
      [event.panelId]: {
        ...context.panels[event.panelId],
        title: event.payload.title,
        value: event.payload.value,
        summary: event.payload.summary,
        freshness: "fresh",
        lastRequestId: event.requestId,
        updatedAt: event.payload.updatedAt,
        invalidatedAt: null,
        error: null,
      },
    },
    currentIssue: null,
  };
}

function failPanel({ context, event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "PANEL_FAILED") {
    return {};
  }

  return {
    panels: {
      ...context.panels,
      [event.panelId]: {
        ...context.panels[event.panelId],
        freshness: "failure",
        lastRequestId: event.requestId,
        error: event.error,
      },
    },
    currentIssue: {
      kind: "failure",
      source: "query",
      requestId: event.requestId,
      panelId: event.panelId,
      error: event.error,
      handled: true,
    },
  };
}

function interruptPanel({ context, event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "PANEL_INTERRUPTED") {
    return {};
  }

  return {
    currentIssue: {
      kind: "interrupt",
      source: "query",
      requestId: event.requestId,
      panelId: event.panelId,
      handled: true,
    },
    panels: {
      ...context.panels,
      [event.panelId]: {
        ...context.panels[event.panelId],
        freshness: "failure",
        lastRequestId: event.requestId,
      },
    },
  };
}

function editWidget({ event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "EDIT_WIDGET") {
    return {};
  }

  return {
    pendingWidget: {
      widgetId: event.widgetId,
      title: event.title,
      targetPanel: event.targetPanel,
    },
  };
}

function finishWidgetSave({ context, event, runtime }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "WIDGET_SAVED") {
    return {};
  }

  return {
    lastSavedWidget: event.result,
    pendingWidget: {
      widgetId: event.result.widgetId,
      title: event.result.savedTitle,
      targetPanel: event.result.targetPanel,
    },
    panels: mapPanels(context.panels, (panel) => ({
      ...panel,
      freshness: "stale",
      invalidatedAt: runtime.now(),
    })),
    currentIssue: null,
  };
}

function failWidgetSave({ event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "WIDGET_SAVE_FAILED") {
    return {};
  }

  return {
    currentIssue: {
      kind: "failure",
      source: "mutation",
      requestId: event.requestId,
      error: event.error,
      handled: true,
    },
  };
}

function interruptWidgetSave({ event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "WIDGET_SAVE_INTERRUPTED") {
    return {};
  }

  return {
    currentIssue: {
      kind: "interrupt",
      source: "mutation",
      requestId: event.requestId,
      handled: true,
    },
  };
}

function defectDashboard({ event }: DashboardArgs): Partial<DashboardContext> {
  if (event.type !== "DASHBOARD_DEFECT") {
    return {};
  }

  return {
    currentIssue: {
      kind: "defect",
      requestId: event.requestId,
      defect: event.defect,
      handled: false,
    },
  };
}

function markPanelsLoading({ context }: DashboardArgs): Partial<DashboardContext> {
  return {
    panels: mapPanels(context.panels, (panel) => ({
      ...panel,
      freshness: "loading",
    })),
    currentIssue: null,
  };
}

function markPanelsStale({ context, runtime }: DashboardArgs): Partial<DashboardContext> {
  return {
    panels: mapPanels(context.panels, (panel) => ({
      ...panel,
      freshness: "stale",
      invalidatedAt: runtime.now(),
    })),
  };
}

function dismissIssue(): Partial<DashboardContext> {
  return {
    currentIssue: null,
  };
}

function canSaveWidget({ context }: DashboardArgs): boolean {
  return selectCanSaveWidget(context);
}

function mapPanels(
  panels: DashboardContext["panels"],
  map: (panel: DashboardPanelView) => DashboardPanelView,
): DashboardContext["panels"] {
  return {
    stats: map(panels.stats),
    revenue: map(panels.revenue),
    alerts: map(panels.alerts),
  };
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}
