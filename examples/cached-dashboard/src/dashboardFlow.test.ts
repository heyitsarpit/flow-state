import { describe, expect, it } from "vite-plus/test";

import { createKey, flowTest, selectView } from "@flow-state/core";

import {
  alertsPanelEffect,
  dashboardApi,
  dashboardInvalidationTargets,
  dashboardKeys,
  dashboardPanels,
  dashboardPredicates,
  dashboardServiceTestLayer,
  dashboardTags,
  dashboardViews,
  revenuePanelEffect,
  statsPanelEffect,
  updateWidgetEffect,
} from "./dashboardApi";
import {
  dashboardMachine,
  selectCanSaveWidget,
  selectDashboardSummary,
  selectPanelList,
  statusLabel,
} from "./dashboardFlow";
import type { DashboardPanelId, DashboardPanelPayload, DashboardSaveError } from "./dashboardFlow";

function createDashboardHarness(now?: () => number) {
  const harness = flowTest(dashboardMachine);
  if (now !== undefined) {
    harness.clock(now);
  }
  return harness.provide(dashboardServiceTestLayer.layer);
}

type DashboardHarness = ReturnType<typeof createDashboardHarness>;

function panelPayload(panelId: DashboardPanelId, value: string = panelId): DashboardPanelPayload {
  return {
    panelId,
    title: `${panelId} panel`,
    value,
    summary: `${panelId} summary`,
    updatedAt: 1_111,
  };
}

async function loadAllPanels(harness: DashboardHarness): Promise<DashboardHarness> {
  statsPanelEffect.succeed(panelPayload("stats", "92%"));
  revenuePanelEffect.succeed(panelPayload("revenue", "$128k"));
  alertsPanelEffect.succeed(panelPayload("alerts", "3 open"));
  await harness.flush();
  await harness.flush();
  return harness;
}

describe("Example 3 Cached Dashboard API pressure", () => {
  it("records dashboard query keys, tags, cache policy, routes, and service layer", () => {
    expect(dashboardKeys.panel("tenant-1", "stats")).toMatchObject({
      kind: "key",
      parts: ["dashboard", "tenant-1", "panel", "stats"],
      hash: JSON.stringify(["dashboard", "tenant-1", "panel", "stats"]),
    });
    expect(dashboardKeys.widgets("tenant-1")).toMatchObject({
      kind: "key",
      parts: ["dashboard", "tenant-1", "widgets"],
    });
    expect(dashboardTags.panel).toEqual({ kind: "tag", name: "dashboard-panel" });
    expect(dashboardPredicates.criticalPanels).toMatchObject({
      kind: "predicate",
      id: "critical-dashboard-panels",
    });

    expect(dashboardApi.panels).toHaveLength(3);
    expect(dashboardApi.panels.map((query) => query.kind)).toEqual(["query", "query", "query"]);
    expect(dashboardApi.panels[0]?.config).toMatchObject({
      id: "dashboard.stats",
      tags: [dashboardTags.dashboard, dashboardTags.panel, dashboardTags.critical],
      cache: {
        staleTime: 30_000,
        gcTime: 300_000,
        keepPreviousData: true,
      },
      policy: "stale-while-revalidate",
      routes: {
        success: expect.any(Function),
        failure: expect.any(Function),
        defect: expect.any(Function),
        interrupt: expect.any(Function),
      },
    });
    expect(dashboardPanels.map((panel) => panel.id)).toEqual(["stats", "revenue", "alerts"]);
    expect(dashboardServiceTestLayer.kind).toBe("testLayer");
    expect(dashboardServiceTestLayer.service).toBeDefined();
  });

  it("records widget mutation shape and dynamic invalidation targets", () => {
    const input = dashboardApi.updateWidget.config.input({
      context: {
        tenantId: "tenant-north",
        panels: dashboardMachine.getInitialSnapshot().context.panels,
        pendingWidget: {
          widgetId: "widget-1",
          title: "  Revenue   tile  ",
          targetPanel: "revenue",
        },
        lastSavedWidget: null,
        currentIssue: null,
      },
      event: { type: "SAVE_WIDGET" },
    });

    expect(input).toEqual({
      tenantId: "tenant-north",
      widgetId: "widget-1",
      title: "Revenue tile",
      targetPanel: "revenue",
    });
    expect(dashboardApi.updateWidget.kind).toBe("mutation");
    expect(dashboardApi.updateWidget.config).toMatchObject({
      id: "dashboard.update-widget",
      scope: "dashboard-widget",
      concurrency: "reject-while-running",
    });

    if (input === null) {
      throw new Error("expected widget input");
    }

    expect(
      dashboardInvalidationTargets({
        input,
        value: {
          ok: true,
          widgetId: "widget-1",
          targetPanel: "revenue",
          savedTitle: "Revenue tile",
          savedAt: 1,
        },
      }),
    ).toEqual([
      dashboardTags.panel,
      dashboardKeys.panel("tenant-north", "revenue"),
      dashboardPredicates.criticalPanels,
      "alerts-panel",
    ]);
  });

  it("records dashboard view descriptors while selectors stay plain functions", async () => {
    const harness = createDashboardHarness();
    await loadAllPanels(harness);

    expect(dashboardViews.panels).toMatchObject({
      kind: "view",
      config: {
        id: "dashboard.panels",
        sources: ["context", "resources"],
        meta: {
          panelResources: ["dashboard.stats", "dashboard.revenue", "dashboard.alerts"],
          equality: "panel-id-freshness-request-invalidated",
        },
      },
    });
    expect(dashboardViews.summary).toMatchObject({
      kind: "view",
      config: {
        id: "dashboard.summary",
        sources: ["context", "resources"],
        meta: {
          sourceView: "dashboard.panels",
          equality: "summary-counts",
        },
      },
    });
    expect(selectView(harness.snapshot(), dashboardViews.panels)).toEqual(
      selectPanelList(harness.context()),
    );
    expect(selectView(harness.snapshot(), dashboardViews.summary)).toEqual({
      fresh: 3,
      stale: 0,
      loading: 0,
      failures: 0,
    });
  });
});

describe("Example 3 Cached Dashboard runtime proof", () => {
  it("writes multiple query results into cache with keys, tags, and timestamps", async () => {
    let now = 10_000;
    const harness = createDashboardHarness(() => now);

    expect(harness.cache().query("dashboard.stats")).toMatchObject({
      id: "dashboard.stats",
      status: "loading",
      fetchStatus: "fetching",
      key: dashboardKeys.panel("tenant-north", "stats").hash,
      tags: ["dashboard", "dashboard-panel", "critical-panel"],
      observers: 1,
    });

    await loadAllPanels(harness);

    expect(selectDashboardSummary(harness.context())).toEqual({
      fresh: 3,
      stale: 0,
      loading: 0,
      failures: 0,
    });
    expect(harness.cache().writes()).toHaveLength(3);
    expect(harness.cache().writes(dashboardKeys.panel("tenant-north", "revenue"))).toContainEqual(
      expect.objectContaining({
        type: "cache:write",
        id: "dashboard.revenue",
        requestId: 2,
        key: dashboardKeys.panel("tenant-north", "revenue").hash,
        tags: ["dashboard", "dashboard-panel", "revenue-panel"],
        at: 10_000,
      }),
    );
    expect(
      harness.cache().get(createKey("dashboard", "tenant-north", "panel", "stats")),
    ).toMatchObject({
      id: "dashboard.stats",
      status: "success",
      stale: false,
      updatedAt: 10_000,
      staleAt: 40_000,
      gcAt: 310_000,
      value: panelPayload("stats", "92%"),
    });

    now = 12_000;
    expect(statusLabel(harness.snapshot())).toBe("fresh");
    expect(selectPanelList(harness.context()).map((panel) => panel.freshness)).toEqual([
      "fresh",
      "fresh",
      "fresh",
    ]);
  });

  it("submits a widget update and records tag, key, predicate, and string invalidation receipts", async () => {
    let now = 20_000;
    const harness = createDashboardHarness(() => now);
    await loadAllPanels(harness);

    now = 25_000;
    harness
      .send({
        type: "EDIT_WIDGET",
        widgetId: "widget-forecast",
        title: "  Forecast   v2 ",
        targetPanel: "revenue",
      })
      .send({ type: "SAVE_WIDGET" });

    expect(harness.state()).toBe("saving");
    expect(harness.mutations()["dashboard.update-widget"]).toMatchObject({
      id: "dashboard.update-widget",
      status: "running",
      requestId: 4,
      variables: {
        tenantId: "tenant-north",
        widgetId: "widget-forecast",
        title: "Forecast v2",
        targetPanel: "revenue",
      },
    });

    updateWidgetEffect.succeed({
      ok: true,
      widgetId: "widget-forecast",
      targetPanel: "revenue",
      savedTitle: "Forecast v2",
      savedAt: 25_000,
    });
    await harness.flush();
    await harness.flush();

    expect(harness.state()).toBe("active");
    expect(harness.context().lastSavedWidget).toMatchObject({
      widgetId: "widget-forecast",
      savedTitle: "Forecast v2",
    });
    expect(harness.cache().invalidations()).toEqual([
      expect.objectContaining({
        type: "cache:invalidate",
        id: "dashboard.update-widget",
        requestId: 4,
        target: "tag:dashboard-panel",
      }),
      expect.objectContaining({
        type: "cache:invalidate",
        id: "dashboard.update-widget",
        requestId: 4,
        target: dashboardKeys.panel("tenant-north", "revenue").hash,
      }),
      expect.objectContaining({
        type: "cache:invalidate",
        id: "dashboard.update-widget",
        requestId: 4,
        target: "predicate:critical-dashboard-panels",
      }),
      expect.objectContaining({
        type: "cache:invalidate",
        id: "dashboard.update-widget",
        requestId: 4,
        target: "alerts-panel",
      }),
    ]);
    expect(harness.cache().invalidations(dashboardTags.panel)).toHaveLength(1);
    expect(
      harness.cache().invalidations(dashboardKeys.panel("tenant-north", "revenue")),
    ).toHaveLength(1);
    expect(
      harness
        .cache()
        .stale()
        .map((resource) => resource.id)
        .sort(),
    ).toEqual(["dashboard.alerts", "dashboard.revenue", "dashboard.stats"]);
    expect(harness.cache().query("dashboard.stats")).toMatchObject({
      stale: true,
      invalidatedAt: 25_000,
    });
    expect(harness.cache().query("dashboard.alerts")).toMatchObject({
      stale: true,
      invalidatedAt: 25_000,
    });
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "cache:stale")
        .map((receipt) => [receipt.id, receipt.key, receipt.target, receipt.tags]),
    ).toEqual([
      [
        "dashboard.update-widget",
        dashboardKeys.panel("tenant-north", "stats").hash,
        "dashboard.stats",
        ["dashboard", "dashboard-panel", "critical-panel"],
      ],
      [
        "dashboard.update-widget",
        dashboardKeys.panel("tenant-north", "revenue").hash,
        "dashboard.revenue",
        ["dashboard", "dashboard-panel", "revenue-panel"],
      ],
      [
        "dashboard.update-widget",
        dashboardKeys.panel("tenant-north", "alerts").hash,
        "dashboard.alerts",
        ["dashboard", "dashboard-panel", "alerts-panel"],
      ],
    ]);
    expect(selectDashboardSummary(harness.context())).toEqual({
      fresh: 0,
      stale: 3,
      loading: 0,
      failures: 0,
    });
    expect(statusLabel(harness.snapshot())).toBe("stale cache");
    expect(harness.cache().query("dashboard.stats")).toMatchObject({
      status: "success",
      fetchStatus: "fetching",
      requestId: 5,
      stale: true,
      value: panelPayload("stats", "92%"),
    });
    expect(harness.cache().query("dashboard.revenue")).toMatchObject({
      status: "success",
      fetchStatus: "fetching",
      requestId: 6,
      stale: true,
      value: panelPayload("revenue", "$128k"),
    });
    expect(harness.cache().query("dashboard.alerts")).toMatchObject({
      status: "success",
      fetchStatus: "fetching",
      requestId: 7,
      stale: true,
      value: panelPayload("alerts", "3 open"),
    });

    await loadAllPanels(harness);
    expect(
      harness
        .cache()
        .stale()
        .map((resource) => resource.id),
    ).toEqual([]);
    expect(selectDashboardSummary(harness.context())).toEqual({
      fresh: 3,
      stale: 0,
      loading: 0,
      failures: 0,
    });
  });

  it("routes query failures into product state without cache write receipts", async () => {
    const error: DashboardSaveError = {
      _tag: "PanelUnavailable",
      panelId: "revenue",
      message: "Revenue backend is warming.",
    };
    const harness = createDashboardHarness();

    statsPanelEffect.succeed(panelPayload("stats", "92%"));
    alertsPanelEffect.succeed(panelPayload("alerts", "2 open"));
    await harness.flush();
    await harness.flush();

    revenuePanelEffect.fail(error);
    await harness.flush();
    await harness.flush();

    expect(harness.state()).toBe("failure");
    expect(harness.context().panels.revenue).toMatchObject({
      freshness: "failure",
      error,
      lastRequestId: 2,
    });
    expect(harness.context().currentIssue).toEqual({
      kind: "failure",
      source: "query",
      requestId: 2,
      panelId: "revenue",
      error,
      handled: true,
    });
    expect(selectDashboardSummary(harness.context())).toEqual({
      fresh: 2,
      stale: 0,
      loading: 0,
      failures: 1,
    });
    expect(statusLabel(harness.snapshot())).toBe("panel failure");
    expect(harness.cache().writes()).toHaveLength(2);
    expect(harness.cache().writes(dashboardKeys.panel("tenant-north", "revenue"))).toEqual([]);
    expect(harness.issues()).toContainEqual({
      kind: "failure",
      source: "query",
      id: "dashboard.revenue",
      requestId: 2,
      key: dashboardKeys.panel("tenant-north", "revenue").hash,
      error,
      handled: true,
    });
  });

  it("proves the product flow around editable widget updates", async () => {
    const harness = createDashboardHarness();
    await loadAllPanels(harness);

    expect(harness.state()).toBe("active");
    expect(selectCanSaveWidget(harness.context())).toBe(true);

    harness
      .send({ type: "EDIT_WIDGET", widgetId: "widget-alerts", title: "   ", targetPanel: "alerts" })
      .send({ type: "SAVE_WIDGET" });

    expect(harness.state()).toBe("active");
    expect(harness.mutations()["dashboard.update-widget"]).toBeUndefined();

    harness
      .send({
        type: "EDIT_WIDGET",
        widgetId: "widget-alerts",
        title: "Alert review",
        targetPanel: "alerts",
      })
      .send({ type: "SAVE_WIDGET" });

    updateWidgetEffect.succeed({
      ok: true,
      widgetId: "widget-alerts",
      targetPanel: "alerts",
      savedTitle: "Alert review",
      savedAt: 30_000,
    });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      pendingWidget: {
        widgetId: "widget-alerts",
        title: "Alert review",
        targetPanel: "alerts",
      },
      lastSavedWidget: {
        widgetId: "widget-alerts",
        savedTitle: "Alert review",
      },
      currentIssue: null,
    });
    expect(selectPanelList(harness.context()).every((panel) => panel.freshness === "stale")).toBe(
      true,
    );

    await loadAllPanels(harness);
  });
});
