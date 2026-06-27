import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FlowProvider, createRuntime, flow, useFlow, useSelector } from "@flow-state/core";

import "./styles.css";
import { formatBytes, selectCanStart, selectUploadSummary, uploadMachine } from "./uploadFlow";
import type { UploadCandidate, UploadFile, UploadProgress } from "./uploadFlow";

const runtime = createRuntime();

const sampleFiles: readonly UploadCandidate[] = [
  { name: "northstar-demo.mov", size: 2_400_000 },
  { name: "briefing-pack.pdf", size: 860_000 },
  { name: "landing-page.png", size: 1_280_000 },
];

const quickFiles: readonly UploadCandidate[] = [
  { name: "avatar.webp", size: 240_000 },
  { name: "copy-notes.md", size: 32_000 },
];

function UploadManagerExample(): React.ReactElement {
  const actor = useFlow(uploadMachine);
  const snapshot = useSelector(actor, (current) => current);
  const summary = useSelector(
    actor,
    (current) => selectUploadSummary(current.context),
    sameSummary,
  );
  const canStart = selectCanStart(snapshot.context) && flow.can(actor, { type: "START_UPLOAD" });
  const canCancel = flow.can(actor, { type: "CANCEL_UPLOAD" });
  const nextProgress = createProgressTick(snapshot.context.files);
  const canTick = snapshot.value === "uploading" && nextProgress !== null;

  function choose(files: readonly UploadCandidate[]): void {
    actor.send({ type: "CHOOSE_FILES", files });
  }

  function tick(): void {
    if (nextProgress !== null) {
      actor.send({ type: "UPLOAD_PROGRESS", progress: nextProgress });
    }
  }

  function complete(): void {
    for (const file of snapshot.context.files) {
      actor.send({
        type: "UPLOAD_PROGRESS",
        progress: {
          fileId: file.id,
          uploadedBytes: file.size,
          totalBytes: file.size,
        },
      });
    }
    actor.send({ type: "UPLOAD_DONE" });
  }

  return (
    <main className="uploadShell">
      <section className="commandSurface" aria-labelledby="upload-heading">
        <header className="masthead">
          <div>
            <p className="eyebrow">Example 2</p>
            <h1 id="upload-heading">Streaming Upload Manager</h1>
          </div>
          <StatusPill state={snapshot.value} />
        </header>

        <section className="controlBand" aria-label="Upload commands">
          <div className="choiceGroup">
            <button type="button" onClick={() => choose(sampleFiles)}>
              Stage release files
            </button>
            <button type="button" onClick={() => choose(quickFiles)}>
              Stage quick batch
            </button>
          </div>

          <div className="runGroup">
            <button
              type="button"
              className="primary"
              disabled={!canStart}
              onClick={() => actor.send({ type: "START_UPLOAD" })}
            >
              Start
            </button>
            <button type="button" disabled={!canTick} onClick={tick}>
              Tick
            </button>
            <button type="button" disabled={snapshot.value !== "uploading"} onClick={complete}>
              Complete
            </button>
            <button
              type="button"
              disabled={!canCancel}
              onClick={() => actor.send({ type: "CANCEL_UPLOAD" })}
            >
              Cancel
            </button>
          </div>
        </section>

        <section className="summaryStrip" aria-label="Upload summary">
          <div>
            <span className="metric">{summary.percent}%</span>
            <span className="metricLabel">transferred</span>
          </div>
          <div>
            <span className="metric">{snapshot.context.files.length}</span>
            <span className="metricLabel">files</span>
          </div>
          <div>
            <span className="metric small">{formatBytes(summary.uploadedBytes)}</span>
            <span className="metricLabel">sent</span>
          </div>
        </section>

        <div className="progressRail" aria-label={summary.statusText}>
          <span style={{ width: `${summary.percent}%` }} />
        </div>

        {snapshot.context.failure === null ? null : (
          <p className="failureNotice" role="alert">
            {snapshot.context.failure.message}
          </p>
        )}

        <FileQueue files={snapshot.context.files} />

        <footer className="footerActions">
          <button
            type="button"
            disabled={!flow.can(actor, { type: "RETRY_UPLOAD" })}
            onClick={() => actor.send({ type: "RETRY_UPLOAD" })}
          >
            Retry
          </button>
          <button
            type="button"
            disabled={
              !flow.can(actor, { type: "DISMISS" }) && !flow.can(actor, { type: "REMOVE_UPLOAD" })
            }
            onClick={() =>
              actor.send(
                flow.can(actor, { type: "DISMISS" })
                  ? { type: "DISMISS" }
                  : { type: "REMOVE_UPLOAD" },
              )
            }
          >
            Clear
          </button>
          <button
            type="button"
            disabled={snapshot.value !== "uploading"}
            onClick={() =>
              actor.send({
                type: "UPLOAD_FAILED",
                error: {
                  _tag: "NetworkUnavailable",
                  message: "Transfer window closed.",
                },
              })
            }
          >
            Fail
          </button>
        </footer>
      </section>
    </main>
  );
}

function StatusPill(props: { readonly state: string }): React.ReactElement {
  return <span className={`statusPill ${props.state}`}>{props.state}</span>;
}

function FileQueue(props: { readonly files: readonly UploadFile[] }): React.ReactElement {
  if (props.files.length === 0) {
    return (
      <div className="emptyQueue">
        <span />
        <p>No files staged</p>
      </div>
    );
  }

  return (
    <ol className="fileQueue">
      {props.files.map((file) => {
        const percent = file.size === 0 ? 0 : Math.round((file.uploadedBytes / file.size) * 100);

        return (
          <li key={file.id} className={`fileRow ${file.status}`}>
            <div className="fileMeta">
              <strong>{file.name}</strong>
              <span>
                {formatBytes(file.uploadedBytes)} / {formatBytes(file.size)}
              </span>
            </div>
            <div className="fileMeter" aria-label={`${file.name} ${percent}%`}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="fileStatus">{file.status}</span>
          </li>
        );
      })}
    </ol>
  );
}

function createProgressTick(files: readonly UploadFile[]): UploadProgress | null {
  const file = files.find((item) => item.status === "uploading" && item.uploadedBytes < item.size);
  if (file === undefined) {
    return null;
  }

  const step = Math.max(Math.round(file.size * 0.28), 1);
  return {
    fileId: file.id,
    uploadedBytes: Math.min(file.uploadedBytes + step, file.size),
    totalBytes: file.size,
  };
}

function sameSummary(
  left: ReturnType<typeof selectUploadSummary>,
  right: ReturnType<typeof selectUploadSummary>,
): boolean {
  return (
    left.totalBytes === right.totalBytes &&
    left.uploadedBytes === right.uploadedBytes &&
    left.percent === right.percent &&
    left.statusText === right.statusText
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <FlowProvider runtime={runtime}>
      <UploadManagerExample />
    </FlowProvider>
  </StrictMode>,
);
