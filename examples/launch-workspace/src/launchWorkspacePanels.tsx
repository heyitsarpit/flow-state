import type { LaunchProject, ProjectDraft } from "./domain";
import type { LaunchWorkspaceDebugSelection } from "./launchWorkspaceDebug";
import type { LaunchOverviewSelection, TraceTimelineSelection } from "./launchWorkspaceViews";

export interface LaunchWorkspaceShellSummary {
  readonly title: string;
  readonly activeTab: string;
  readonly readinessScore: number;
  readonly openChecklist: number;
  readonly assetCount: number;
  readonly approvalStatus: string;
  readonly saveStatus: string;
  readonly queuedSaves: number;
  readonly hasSaveConflict: boolean;
  readonly traceLabel: string;
}

interface LaunchWorkspaceEditorPanelProps {
  readonly draft: ProjectDraft;
  readonly project: LaunchProject | undefined;
  readonly projectResourceStatus: string;
  readonly surfaceCount: number;
  readonly workspace: LaunchWorkspaceShellSummary;
}

interface LaunchWorkspaceOverviewPanelProps {
  readonly overview: LaunchOverviewSelection;
  readonly workspace: LaunchWorkspaceShellSummary;
}

interface LaunchWorkspaceTracePanelProps {
  readonly trace: TraceTimelineSelection;
  readonly traceLabel: string;
}

interface LaunchWorkspaceDebugPanelProps {
  readonly debug: LaunchWorkspaceDebugSelection;
}

function EmptyList({ label }: { readonly label: string }) {
  return <p className="empty-state">{label}</p>;
}

export function LaunchWorkspaceEditorPanel({
  draft,
  project,
  projectResourceStatus,
  surfaceCount,
  workspace,
}: LaunchWorkspaceEditorPanelProps) {
  return (
    <section className="editor-surface" aria-label="Editor">
      <article className="editor-hero">
        <div className="section-heading">
          <p className="section-label">Workspace actor</p>
          <h2>{project?.name ?? draft.name}</h2>
        </div>
        <p className="editor-copy">
          Canonical project data stays in ResourceStore while the draft, tab state, and trace label
          stay in the workspace flow. The shell reads both without flattening them into one giant
          prop bag.
        </p>
        <dl className="metrics-grid">
          <div>
            <dt>Project resource</dt>
            <dd>{projectResourceStatus}</dd>
          </div>
          <div>
            <dt>Readiness score</dt>
            <dd>{workspace.readinessScore}</dd>
          </div>
          <div>
            <dt>Open checklist</dt>
            <dd>{workspace.openChecklist}</dd>
          </div>
          <div>
            <dt>Assets tracked</dt>
            <dd>{workspace.assetCount}</dd>
          </div>
          <div>
            <dt>Approval status</dt>
            <dd>{workspace.approvalStatus}</dd>
          </div>
          <div>
            <dt>vNext surfaces assigned</dt>
            <dd>{surfaceCount}</dd>
          </div>
        </dl>
      </article>

      <article className="draft-panel">
        <div className="section-heading">
          <p className="section-label">Draft context</p>
          <h3>Flow-owned draft</h3>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Name</dt>
            <dd>{draft.name}</dd>
          </div>
          <div>
            <dt>Launch date</dt>
            <dd>{draft.launchDate}</dd>
          </div>
          <div>
            <dt>Save lane</dt>
            <dd>{workspace.saveStatus}</dd>
          </div>
          <div>
            <dt>Queued saves</dt>
            <dd>{workspace.queuedSaves}</dd>
          </div>
          <div>
            <dt>Conflict</dt>
            <dd>{workspace.hasSaveConflict ? "present" : "clear"}</dd>
          </div>
          <div>
            <dt>Latest trace</dt>
            <dd>{workspace.traceLabel}</dd>
          </div>
        </dl>
        <p className="supporting-copy">{draft.summary}</p>
      </article>
    </section>
  );
}

export function LaunchWorkspaceOverviewPanel({
  overview,
  workspace,
}: LaunchWorkspaceOverviewPanelProps) {
  return (
    <article className="inspection-panel" aria-label="Overview projection">
      <div className="section-heading">
        <p className="section-label">Overview view</p>
        <h3>Joined runtime summary</h3>
      </div>
      <dl className="detail-list">
        <div>
          <dt>Project id</dt>
          <dd>{overview.projectId}</dd>
        </div>
        <div>
          <dt>Project resource</dt>
          <dd>{overview.projectResourceStatus}</dd>
        </div>
        <div>
          <dt>Readiness resource</dt>
          <dd>{overview.readinessResourceStatus}</dd>
        </div>
        <div>
          <dt>Asset resource</dt>
          <dd>{overview.assetResourceStatus}</dd>
        </div>
        <div>
          <dt>Approval resource</dt>
          <dd>{overview.approvalResourceStatus}</dd>
        </div>
        <div>
          <dt>Save transaction</dt>
          <dd>{overview.saveTransactionStatus}</dd>
        </div>
        <div>
          <dt>Active tab</dt>
          <dd>{workspace.activeTab}</dd>
        </div>
        <div>
          <dt>Issues</dt>
          <dd>{overview.issueCount}</dd>
        </div>
      </dl>

      <div className="summary-group">
        <p className="summary-label">Live child ownership</p>
        {overview.activeChildIds.length === 0 ? (
          <EmptyList label="No active child actors." />
        ) : (
          <ul className="token-list">
            {overview.activeChildIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-group">
        <p className="summary-label">Visible stream work</p>
        {overview.streamIds.length === 0 ? (
          <EmptyList label="No stream snapshots yet." />
        ) : (
          <ul className="token-list">
            {overview.streamIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function LaunchWorkspaceTracePanel({ trace, traceLabel }: LaunchWorkspaceTracePanelProps) {
  return (
    <article className="inspection-panel" aria-label="Trace projection">
      <div className="section-heading">
        <p className="section-label">Trace view</p>
        <h3>Receipts and issues</h3>
      </div>
      <p className="trace-label">
        <span>Latest trace</span>
        <strong>{traceLabel}</strong>
      </p>

      <div className="summary-group">
        <p className="summary-label">Recent receipts</p>
        {trace.recentReceiptTypes.length === 0 ? (
          <EmptyList label="No receipts yet." />
        ) : (
          <ul className="token-list">
            {trace.recentReceiptTypes.map((receipt, index) => (
              <li key={`${receipt}-${index}`}>{receipt}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-group">
        <p className="summary-label">Stream summaries</p>
        {trace.streamSummaries.length === 0 ? (
          <EmptyList label="No stream summaries yet." />
        ) : (
          <ul className="stack-list">
            {trace.streamSummaries.map((stream) => (
              <li key={stream.id}>
                <strong>{stream.id}</strong>
                <span>
                  {stream.status}
                  {stream.emitted > 0 ? `, emitted ${stream.emitted}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-group">
        <p className="summary-label">Child summaries</p>
        {trace.childSummaries.length === 0 ? (
          <EmptyList label="No child snapshots yet." />
        ) : (
          <ul className="stack-list">
            {trace.childSummaries.map((child) => (
              <li key={child.id}>
                <strong>{child.id}</strong>
                <span>
                  {child.status}
                  {child.parentState === undefined ? "" : `, ${child.parentState}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-group">
        <p className="summary-label">Issue summaries</p>
        {trace.issueSummaries.length === 0 ? (
          <EmptyList label="No live issues." />
        ) : (
          <ul className="stack-list">
            {trace.issueSummaries.map((issue) => (
              <li key={`${issue.source}:${issue.id}`}>
                <strong>{issue.id}</strong>
                <span>
                  {issue.source}, {issue.kind}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function LaunchWorkspaceDebugPanel({ debug }: LaunchWorkspaceDebugPanelProps) {
  const pendingEntries = [
    ...debug.pendingTransactions.map((id) => ({
      key: `transaction:${id}`,
      label: id,
      detail: "transaction pending",
    })),
    ...debug.pendingStreams.map((id) => ({
      key: `stream:${id}`,
      label: id,
      detail: "stream running",
    })),
    ...debug.scheduledTimers.map((timer) => ({
      key: `timer:${timer.id}`,
      label: timer.id,
      detail: `timer scheduled, ${timer.parentState}, due ${timer.dueAt}`,
    })),
    ...debug.activeChildren.map((child) => ({
      key: `child:${child.id}`,
      label: child.id,
      detail:
        child.parentState === undefined
          ? `${child.status} child`
          : `${child.status} child, ${child.parentState}`,
    })),
  ];

  return (
    <article className="inspection-panel" aria-label="Debug projection">
      <div className="section-heading">
        <p className="section-label">Debug panel</p>
        <h3>Pending work and runtime facts</h3>
      </div>

      <div className="summary-group">
        <p className="summary-label">Pending work</p>
        {pendingEntries.length === 0 ? (
          <EmptyList label="No pending runtime work." />
        ) : (
          <ul className="stack-list">
            {pendingEntries.map((entry) => (
              <li key={entry.key}>
                <strong>{entry.label}</strong>
                <span>{entry.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-group">
        <p className="summary-label">Active runtime facts</p>
        {debug.activeRuntimeFacts.length === 0 ? (
          <EmptyList label="No runtime facts active yet." />
        ) : (
          <ul className="stack-list">
            {debug.activeRuntimeFacts.map((fact) => (
              <li key={fact.fact}>
                <strong>{fact.fact}</strong>
                <span>{fact.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="summary-group">
        <p className="summary-label">Recent receipts</p>
        {debug.recentReceipts.length === 0 ? (
          <EmptyList label="No recent runtime receipts." />
        ) : (
          <ul className="stack-list">
            {debug.recentReceipts.map((receipt, index) => (
              <li key={`${receipt.type}:${receipt.id ?? receipt.source ?? "runtime"}:${index}`}>
                <strong>{receipt.type}</strong>
                <span>{receipt.id ?? receipt.source ?? "runtime"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
