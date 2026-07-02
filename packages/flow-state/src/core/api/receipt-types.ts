export type FlowReceipt = Readonly<{
  readonly type: string;
  readonly id?: string;
  readonly requestId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}>;

export type FlowReceiptFacts = Readonly<{
  readonly receiptTypes: ReadonlyArray<string>;
  readonly relatedIds: ReadonlyArray<string>;
}>;

export type FlowIssueFacts = FlowReceiptFacts &
  Readonly<{
    readonly correlationId?: string;
    readonly parentState?: string;
  }>;

export type FlowIssueSummary = FlowIssueFacts &
  Readonly<{
    readonly kind: "failure" | "defect" | "interrupt";
    readonly source: "resource" | "transaction" | "machine" | "stream" | "child";
    readonly id: string;
  }>;

export type FlowIssue = Readonly<{
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "resource" | "transaction" | "machine" | "stream" | "child";
  readonly id: string;
  readonly error?: unknown;
  readonly cause?: unknown;
  readonly handled?: boolean;
  readonly facts?: FlowIssueFacts;
}>;
