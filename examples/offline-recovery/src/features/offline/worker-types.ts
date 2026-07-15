import type { Option } from "effect";

import type { CommentRejected } from "../../domain/offline";

export interface WorkerContext {
  readonly lastError: Option.Option<CommentRejected>;
}

export type WorkerEvent = Readonly<{
  readonly type: "DRAIN_FAILED";
  readonly error: CommentRejected;
}>;
