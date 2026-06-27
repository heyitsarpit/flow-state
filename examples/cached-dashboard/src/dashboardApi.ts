import { Context, Effect } from "effect";

import {
  createControlledEffect,
  createKey,
  createTag,
  createTestLayer,
  flow,
} from "@flow-state/core";

import type {
  FlowCacheInvalidationTarget,
  FlowMutationConfig,
  FlowQueryConfig,
  FlowResourceSnapshot,
} from "@flow-state/core";

import type {
  DashboardContext,
  DashboardEvent,
  DashboardPanel,
  DashboardPanelId,
  DashboardPanelPayload,
  DashboardPanelView,
  DashboardSaveError,
  DashboardState,
  WidgetUpdateInput,
  WidgetUpdateResult,
} from "./dashboardFlow";

type ContextArgs = {
  readonly context: DashboardContext;
  readonly event: DashboardEvent | null;
};

type MutationInputArgs = {
  readonly context: DashboardContext;
  readonly event: DashboardEvent;
};

interface DashboardSummaryView {
  readonly fresh: number;
  readonly stale: number;
  readonly loading: number;
  readonly failures: number;
}

export interface DashboardServiceImplementation {
  readonly loadPanel: (
    tenantId: string,
    panelId: DashboardPanelId,
  ) => Effect.Effect<DashboardPanelPayload, DashboardSaveError>;
  readonly saveWidget: (
    input: WidgetUpdateInput,
  ) => Effect.Effect<WidgetUpdateResult, DashboardSaveError>;
}

export class DashboardService extends Context.Service<
  DashboardService,
  DashboardServiceImplementation
>()("example/DashboardService") {}

export const dashboardKeys = {
  panel(tenantId: string, panelId: DashboardPanelId) {
    return createKey("dashboard", tenantId, "panel", panelId);
  },
  widgets(tenantId: string) {
    return createKey("dashboard", tenantId, "widgets");
  },
};

export const dashboardTags = {
  dashboard: createTag("dashboard"),
  panel: createTag("dashboard-panel"),
  critical: createTag("critical-panel"),
  revenue: createTag("revenue-panel"),
  alerts: createTag("alerts-panel"),
};

export const dashboardPredicates = {
  criticalPanels: {
    kind: "predicate",
    id: "critical-dashboard-panels",
    match: (resource: FlowResourceSnapshot) =>
      resource.tags?.includes(dashboardTags.critical.name) === true,
  } satisfies FlowCacheInvalidationTarget,
};

const loadPanel = Effect.fn("CachedDashboard.loadPanel")(function* (
  tenantId: string,
  panelId: DashboardPanelId,
) {
  const service = yield* DashboardService;
  return yield* service.loadPanel(tenantId, panelId);
});

const saveWidget = Effect.fn("CachedDashboard.saveWidget")(function* (input: WidgetUpdateInput) {
  const service = yield* DashboardService;
  return yield* service.saveWidget(input);
});

function panelQuery(panel: DashboardPanel): ReturnType<typeof flow.query> {
  return flow.query<
    FlowQueryConfig<DashboardContext, DashboardEvent, DashboardPanelPayload, DashboardSaveError>
  >({
    id: `dashboard.${panel.id}`,
    key: ({ context }: ContextArgs) => dashboardKeys.panel(context.tenantId, panel.id),
    tags: panel.tags,
    effect: ({ context }: ContextArgs) => loadPanel(context.tenantId, panel.id),
    cache: {
      staleTime: panel.staleTime,
      gcTime: 300_000,
      keepPreviousData: true,
    },
    policy: "stale-while-revalidate",
    routes: flow.outcomes<DashboardPanelPayload, DashboardSaveError, DashboardEvent>({
      success: ({ requestId, value }) => ({
        type: "PANEL_LOADED",
        requestId,
        panelId: panel.id,
        payload: value,
      }),
      failure: ({ requestId, error }) => ({
        type: "PANEL_FAILED",
        requestId,
        panelId: panel.id,
        error,
      }),
      defect: ["DASHBOARD_DEFECT", "defect"],
      interrupt: ({ requestId }) => ({
        type: "PANEL_INTERRUPTED",
        requestId,
        panelId: panel.id,
      }),
    }),
  });
}

export const dashboardPanels: readonly DashboardPanel[] = [
  {
    id: "stats",
    title: "KPI strip",
    tags: [dashboardTags.dashboard, dashboardTags.panel, dashboardTags.critical],
    staleTime: 30_000,
  },
  {
    id: "revenue",
    title: "Revenue",
    tags: [dashboardTags.dashboard, dashboardTags.panel, dashboardTags.revenue],
    staleTime: 45_000,
  },
  {
    id: "alerts",
    title: "Alerts",
    tags: [dashboardTags.dashboard, dashboardTags.panel, dashboardTags.alerts],
    staleTime: 15_000,
  },
];

export function dashboardInvalidationTargets(args: {
  readonly input: WidgetUpdateInput;
  readonly value: WidgetUpdateResult;
}): readonly FlowCacheInvalidationTarget[] {
  return [
    dashboardTags.panel,
    dashboardKeys.panel(args.input.tenantId, args.input.targetPanel),
    dashboardPredicates.criticalPanels,
    "alerts-panel",
  ];
}

export const dashboardApi = {
  panels: dashboardPanels.map((panel) => panelQuery(panel)),
  updateWidget: flow.mutation<
    FlowMutationConfig<
      DashboardContext,
      DashboardEvent,
      WidgetUpdateInput,
      WidgetUpdateResult,
      DashboardSaveError
    >
  >({
    id: "dashboard.update-widget",
    input: ({ context }: MutationInputArgs): WidgetUpdateInput | null =>
      context.pendingWidget === null
        ? null
        : {
            tenantId: context.tenantId,
            widgetId: context.pendingWidget.widgetId,
            title: normalize(context.pendingWidget.title),
            targetPanel: context.pendingWidget.targetPanel,
          },
    effect: saveWidget,
    invalidates: dashboardInvalidationTargets,
    scope: "dashboard-widget",
    concurrency: "reject-while-running",
    routes: flow.outcomes<WidgetUpdateResult, DashboardSaveError, DashboardEvent>({
      success: ({ requestId, value }) => ({
        type: "WIDGET_SAVED",
        requestId,
        result: value,
      }),
      failure: ["WIDGET_SAVE_FAILED", "error"],
      defect: ["DASHBOARD_DEFECT", "defect"],
      interrupt: "WIDGET_SAVE_INTERRUPTED",
    }),
  }),
};

export const dashboardViews = {
  panels: flow.view<DashboardContext, DashboardState, readonly DashboardPanelView[]>({
    id: "dashboard.panels",
    sources: ["context", "resources"],
    meta: {
      panelResources: dashboardPanels.map((panel) => `dashboard.${panel.id}`),
      equality: "panel-id-freshness-request-invalidated",
    },
    select: ({ context }): readonly DashboardPanelView[] => [
      context.panels.stats,
      context.panels.revenue,
      context.panels.alerts,
    ],
  }),
  summary: flow.view<DashboardContext, DashboardState, DashboardSummaryView>({
    id: "dashboard.summary",
    sources: ["context", "resources"],
    meta: {
      sourceView: "dashboard.panels",
      equality: "summary-counts",
    },
    select: ({ context }) =>
      [context.panels.stats, context.panels.revenue, context.panels.alerts].reduce(
        (summary, panel) => ({
          fresh: summary.fresh + (panel.freshness === "fresh" ? 1 : 0),
          stale: summary.stale + (panel.freshness === "stale" ? 1 : 0),
          loading: summary.loading + (panel.freshness === "loading" ? 1 : 0),
          failures: summary.failures + (panel.freshness === "failure" ? 1 : 0),
        }),
        { fresh: 0, stale: 0, loading: 0, failures: 0 },
      ),
  }),
};

export const statsPanelEffect = createControlledEffect<DashboardPanelPayload, DashboardSaveError>(
  "dashboard.stats",
);
export const revenuePanelEffect = createControlledEffect<DashboardPanelPayload, DashboardSaveError>(
  "dashboard.revenue",
);
export const alertsPanelEffect = createControlledEffect<DashboardPanelPayload, DashboardSaveError>(
  "dashboard.alerts",
);
export const updateWidgetEffect = createControlledEffect<WidgetUpdateResult, DashboardSaveError>(
  "dashboard.update-widget",
);

export const dashboardServiceTestLayer = createTestLayer(
  DashboardService,
  DashboardService.of({
    loadPanel: (_tenantId, panelId) => panelEffect(panelId).effect(),
    saveWidget: () => updateWidgetEffect.effect(),
  }),
);

export const dashboardServiceDemoLayer = createTestLayer(
  DashboardService,
  DashboardService.of({
    loadPanel: (tenantId, panelId) =>
      Effect.succeed({
        panelId,
        title: dashboardPanels.find((panel) => panel.id === panelId)?.title ?? panelId,
        value: demoValue(tenantId, panelId),
        summary: demoSummary(panelId),
        updatedAt: Date.now(),
      }),
    saveWidget: (input) =>
      Effect.succeed({
        ok: true,
        widgetId: input.widgetId,
        targetPanel: input.targetPanel,
        savedTitle: input.title,
        savedAt: Date.now(),
      }),
  }),
);

function panelEffect(panelId: DashboardPanelId) {
  if (panelId === "stats") {
    return statsPanelEffect;
  }

  if (panelId === "revenue") {
    return revenuePanelEffect;
  }

  return alertsPanelEffect;
}

function normalize(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function demoValue(tenantId: string, panelId: DashboardPanelId): string {
  const tenantOffset = tenantId.length * 3;
  if (panelId === "stats") {
    return `${92 + tenantOffset}%`;
  }

  if (panelId === "revenue") {
    return `$${124 + tenantOffset}k`;
  }

  return `${2 + (tenantOffset % 3)} open`;
}

function demoSummary(panelId: DashboardPanelId): string {
  if (panelId === "stats") {
    return "Fresh cache write from the KPI query.";
  }

  if (panelId === "revenue") {
    return "Revenue panel uses its own dashboard key.";
  }

  return "Alerts also refresh when a widget save hits tags.";
}
