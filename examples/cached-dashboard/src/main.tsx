import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FlowProvider, createRuntime, flow, useFlow, useSelector, useView } from "@flow-state/core";

import { dashboardServiceDemoLayer, dashboardViews } from "./dashboardApi";
import { dashboardMachine, selectCanSaveWidget, statusLabel } from "./dashboardFlow";
import type { DashboardPanelId, DashboardPanelView } from "./dashboardFlow";
import "./styles.css";

const runtime = createRuntime({ layer: dashboardServiceDemoLayer.layer });
const panelOptions: readonly DashboardPanelId[] = ["stats", "revenue", "alerts"];

function CachedDashboardExample(): React.ReactElement {
  const actor = useFlow(dashboardMachine);
  const snapshot = useSelector(actor, (current) => current);
  const panels = useView(actor, dashboardViews.panels);
  const summary = useView(actor, dashboardViews.summary);
  const canSave = selectCanSaveWidget(snapshot.context) && flow.can(actor, { type: "SAVE_WIDGET" });
  const draft = snapshot.context.pendingWidget;

  return (
    <main className="dashboardShell">
      <section className="dashboardSurface" aria-labelledby="dashboard-heading">
        <header className="masthead">
          <div>
            <p className="eyebrow">Example 3</p>
            <h1 id="dashboard-heading">Cached Dashboard</h1>
          </div>
          <span className={`statusPill ${snapshot.value}`}>{statusLabel(snapshot)}</span>
        </header>

        <section className="summaryBand" aria-label="Cache summary">
          <SummaryMetric value={summary.fresh} label="fresh" />
          <SummaryMetric value={summary.stale} label="stale" />
          <SummaryMetric value={summary.loading} label="loading" />
          <SummaryMetric value={summary.failures} label="failed" />
        </section>

        <section className="widgetEditor" aria-label="Widget editor">
          <label>
            Widget
            <input
              value={draft?.title ?? ""}
              onChange={(event) =>
                actor.send({
                  type: "EDIT_WIDGET",
                  widgetId: draft?.widgetId ?? "widget-forecast",
                  title: event.currentTarget.value,
                  targetPanel: draft?.targetPanel ?? "revenue",
                })
              }
            />
          </label>

          <label>
            Panel
            <select
              value={draft?.targetPanel ?? "revenue"}
              onChange={(event) =>
                actor.send({
                  type: "EDIT_WIDGET",
                  widgetId: draft?.widgetId ?? "widget-forecast",
                  title: draft?.title ?? "",
                  targetPanel: event.currentTarget.value as DashboardPanelId,
                })
              }
            >
              {panelOptions.map((panelId) => (
                <option key={panelId} value={panelId}>
                  {panelId}
                </option>
              ))}
            </select>
          </label>

          <div className="buttonRow">
            <button
              type="button"
              disabled={!canSave}
              onClick={() => actor.send({ type: "SAVE_WIDGET" })}
            >
              Save widget
            </button>
            <button
              type="button"
              onClick={() => actor.send({ type: "MARK_STALE_FROM_CACHE" })}
              disabled={snapshot.value === "saving"}
            >
              Mark stale
            </button>
            <button
              type="button"
              onClick={() => actor.send({ type: "REFRESH_DASHBOARD" })}
              disabled={snapshot.value === "saving"}
            >
              Refresh
            </button>
          </div>
        </section>

        {snapshot.context.currentIssue === null ? null : (
          <p className="issueNotice" role="alert">
            {snapshot.context.currentIssue.kind}
          </p>
        )}

        <ol className="panelGrid">
          {panels.map((panel) => (
            <PanelCard key={panel.id} panel={panel} />
          ))}
        </ol>
      </section>
    </main>
  );
}

function SummaryMetric(props: {
  readonly value: number;
  readonly label: string;
}): React.ReactElement {
  return (
    <div>
      <span className="metric">{props.value}</span>
      <span>{props.label}</span>
    </div>
  );
}

function PanelCard(props: { readonly panel: DashboardPanelView }): React.ReactElement {
  return (
    <li className={`panelCard ${props.panel.freshness}`}>
      <div className="panelTopline">
        <h2>{props.panel.title}</h2>
        <span>{props.panel.freshness}</span>
      </div>
      <strong>{props.panel.value}</strong>
      <p>{props.panel.error?.message ?? props.panel.summary}</p>
      <dl>
        <div>
          <dt>request</dt>
          <dd>{props.panel.lastRequestId ?? "-"}</dd>
        </div>
        <div>
          <dt>updated</dt>
          <dd>{props.panel.updatedAt ?? "-"}</dd>
        </div>
        <div>
          <dt>invalidated</dt>
          <dd>{props.panel.invalidatedAt ?? "-"}</dd>
        </div>
      </dl>
    </li>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <FlowProvider runtime={runtime}>
      <CachedDashboardExample />
    </FlowProvider>
  </StrictMode>,
);
