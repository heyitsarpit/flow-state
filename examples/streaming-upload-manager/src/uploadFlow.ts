import { Effect, Stream } from "effect";

import { flow } from "@flow-state/core";
import type {
  FlowAfterConfig,
  FlowEvent,
  FlowSnapshot,
  FlowStreamConfig,
  FlowTransitionArgs,
} from "@flow-state/core";

import { UploadService } from "./uploadApi";

export type UploadState =
  | "idle"
  | "ready"
  | "uploading"
  | "completed"
  | "failed"
  | "cancelled"
  | "defect";

export interface UploadCandidate {
  readonly name: string;
  readonly size: number;
}

export interface UploadFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly uploadedBytes: number;
  readonly status: "queued" | "uploading" | "complete" | "failed" | "cancelled";
}

export interface UploadProgress {
  readonly fileId: string;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
}

export interface UploadFailure {
  readonly _tag: "UploadRejected" | "NetworkUnavailable";
  readonly fileId?: string;
  readonly message: string;
}

export interface UploadContext {
  readonly files: readonly UploadFile[];
  readonly nextFileId: number;
  readonly failure: UploadFailure | null;
  readonly defect: unknown;
}

export type UploadEvent =
  | ({ readonly type: "CHOOSE_FILES"; readonly files: readonly UploadCandidate[] } & FlowEvent)
  | ({ readonly type: "START_UPLOAD" } & FlowEvent)
  | ({ readonly type: "UPLOAD_PROGRESS"; readonly progress: UploadProgress } & FlowEvent)
  | ({ readonly type: "UPLOAD_DONE" } & FlowEvent)
  | ({ readonly type: "UPLOAD_FAILED"; readonly error: UploadFailure } & FlowEvent)
  | ({ readonly type: "UPLOAD_DEFECT"; readonly defect: unknown } & FlowEvent)
  | ({ readonly type: "CANCEL_UPLOAD" } & FlowEvent)
  | ({ readonly type: "RETRY_UPLOAD" } & FlowEvent)
  | ({ readonly type: "REMOVE_UPLOAD" } & FlowEvent)
  | ({ readonly type: "DISMISS" } & FlowEvent);

export type UploadSnapshot = FlowSnapshot<UploadContext, UploadState>;
type UploadArgs = FlowTransitionArgs<UploadContext, UploadEvent, UploadState>;

type UploadStreamConfig = FlowStreamConfig<
  UploadContext,
  UploadEvent,
  { readonly files: readonly UploadFile[] },
  UploadProgress,
  UploadFailure,
  UploadService
> & {
  readonly id: "upload.progress";
  readonly pressure: {
    readonly strategy: "coalesce-latest";
    readonly key: (value: UploadProgress) => string;
  };
  readonly routes: {
    readonly value: (progress: UploadProgress) => UploadEvent;
    readonly done: () => UploadEvent;
    readonly failure: (error: UploadFailure) => UploadEvent;
    readonly defect: (defect: unknown) => UploadEvent;
    readonly interrupt: () => UploadEvent;
  };
};

type UploadTimerConfig = FlowAfterConfig<UploadContext, UploadEvent, UploadState> & {
  readonly id: "upload.dismiss-completed";
  readonly delay: "2 seconds";
  readonly target: "idle";
  readonly update: typeof resetUpload;
};

export const emptyUploadContext: UploadContext = {
  files: [],
  nextFileId: 1,
  failure: null,
  defect: null,
};

export const uploadProgress = flow.stream({
  id: "upload.progress",
  input: ({ context }) => ({ files: context.files }),
  stream: ({ input }) =>
    Stream.unwrap(Effect.map(UploadService, (service) => service.uploadFiles(input.files))),
  pressure: {
    strategy: "coalesce-latest",
    key: (value) => value.fileId,
  },
  routes: {
    value: (progress) => ({ type: "UPLOAD_PROGRESS", progress }),
    done: () => ({ type: "UPLOAD_DONE" }),
    failure: (error) => ({ type: "UPLOAD_FAILED", error }),
    defect: (defect) => ({ type: "UPLOAD_DEFECT", defect }),
    interrupt: () => ({ type: "CANCEL_UPLOAD" }),
  },
} satisfies UploadStreamConfig);

export const dismissCompleted = flow.after<UploadTimerConfig>({
  id: "upload.dismiss-completed",
  delay: "2 seconds",
  target: "idle",
  update: resetUpload,
});

export const uploadMachine = flow.machine<UploadContext, UploadEvent, UploadState>({
  id: "example-2-streaming-upload-manager",
  initial: "idle",
  context: () => emptyUploadContext,
  states: {
    idle: {
      on: {
        CHOOSE_FILES: {
          target: "ready",
          update: chooseFiles,
        },
      },
    },
    ready: {
      on: {
        CHOOSE_FILES: {
          target: "ready",
          update: chooseFiles,
        },
        START_UPLOAD: {
          target: "uploading",
          guard: hasUploadableFiles,
          update: markUploading,
        },
        REMOVE_UPLOAD: {
          target: "idle",
          update: resetUpload,
        },
      },
    },
    uploading: {
      invoke: uploadProgress,
      on: {
        UPLOAD_PROGRESS: {
          update: applyProgress,
        },
        UPLOAD_DONE: {
          target: "completed",
          update: markComplete,
        },
        UPLOAD_FAILED: {
          target: "failed",
          update: recordFailure,
        },
        UPLOAD_DEFECT: {
          target: "defect",
          update: recordDefect,
        },
        CANCEL_UPLOAD: {
          target: "cancelled",
          update: markCancelled,
        },
      },
    },
    completed: {
      after: dismissCompleted,
      on: {
        DISMISS: {
          target: "idle",
          update: resetUpload,
        },
      },
    },
    failed: {
      on: {
        RETRY_UPLOAD: {
          target: "uploading",
          guard: hasFiles,
          update: markUploading,
        },
        REMOVE_UPLOAD: {
          target: "idle",
          update: resetUpload,
        },
      },
    },
    cancelled: {
      on: {
        RETRY_UPLOAD: {
          target: "uploading",
          guard: hasFiles,
          update: markUploading,
        },
        REMOVE_UPLOAD: {
          target: "idle",
          update: resetUpload,
        },
      },
    },
    defect: {},
  },
});

export function chooseFiles({ context, event }: UploadArgs): UploadContext {
  if (event.type !== "CHOOSE_FILES") {
    return context;
  }

  const files = event.files.map((file, index): UploadFile => {
    const id = `file-${context.nextFileId + index}`;
    return {
      id,
      name: file.name,
      size: file.size,
      uploadedBytes: 0,
      status: "queued",
    };
  });

  return {
    files,
    nextFileId: context.nextFileId + files.length,
    failure: null,
    defect: null,
  };
}

export function markUploading({ context }: UploadArgs): Partial<UploadContext> {
  return {
    files: context.files.map((file) => ({
      ...file,
      status: "uploading",
    })),
    failure: null,
    defect: null,
  };
}

export function applyProgress({ context, event }: UploadArgs): Partial<UploadContext> {
  if (event.type !== "UPLOAD_PROGRESS") {
    return context;
  }

  return {
    files: context.files.map((file) => {
      if (file.id !== event.progress.fileId) {
        return file;
      }

      const uploadedBytes = Math.min(event.progress.uploadedBytes, event.progress.totalBytes);
      return {
        ...file,
        uploadedBytes,
        size: event.progress.totalBytes,
        status: uploadedBytes >= event.progress.totalBytes ? "complete" : "uploading",
      };
    }),
  };
}

export function markComplete({ context }: UploadArgs): Partial<UploadContext> {
  return {
    files: context.files.map((file) => ({
      ...file,
      uploadedBytes: file.size,
      status: "complete",
    })),
    failure: null,
  };
}

export function recordFailure({ context, event }: UploadArgs): Partial<UploadContext> {
  if (event.type !== "UPLOAD_FAILED") {
    return context;
  }

  return {
    failure: event.error,
    files: context.files.map((file) => ({
      ...file,
      status:
        event.error.fileId === undefined || event.error.fileId === file.id ? "failed" : file.status,
    })),
  };
}

export function recordDefect({ event }: UploadArgs): Partial<UploadContext> {
  return {
    defect: event.type === "UPLOAD_DEFECT" ? event.defect : null,
  };
}

export function markCancelled({ context }: UploadArgs): Partial<UploadContext> {
  return {
    files: context.files.map((file) => ({
      ...file,
      status: file.status === "complete" ? "complete" : "cancelled",
    })),
  };
}

export function resetUpload(): UploadContext {
  return emptyUploadContext;
}

export function hasFiles({ context }: UploadArgs): boolean {
  return context.files.length > 0;
}

export function hasUploadableFiles({ context }: UploadArgs): boolean {
  return context.files.some(
    (file) => file.status === "queued" || file.status === "cancelled" || file.status === "failed",
  );
}

export function selectUploadSummary(context: UploadContext): {
  readonly totalBytes: number;
  readonly uploadedBytes: number;
  readonly percent: number;
  readonly statusText: string;
} {
  const totalBytes = context.files.reduce((total, file) => total + file.size, 0);
  const uploadedBytes = context.files.reduce((total, file) => total + file.uploadedBytes, 0);
  const percent = totalBytes === 0 ? 0 : Math.round((uploadedBytes / totalBytes) * 100);

  return {
    totalBytes,
    uploadedBytes,
    percent,
    statusText: `${context.files.length} files / ${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes)}`,
  };
}

export function selectCanStart(context: UploadContext): boolean {
  return hasUploadableFiles({
    context,
    event: { type: "START_UPLOAD" },
    snapshot: uploadMachine.getInitialSnapshot(),
    runtime: { now: Date.now },
  });
}

export function formatBytes(value: number): string {
  if (value < 1_000) {
    return `${value} B`;
  }

  if (value < 1_000_000) {
    return `${Math.round(value / 100) / 10} KB`;
  }

  return `${Math.round(value / 100_000) / 10} MB`;
}
