import type { FlowEvent } from "./public/types.js";

export type TransactionInspectionOverlapCause =
  | "active-attempt"
  | "serialize-scope"
  | "cancel-previous"
  | "reject-while-running";

type TransactionPreviewLayerLike = Readonly<{
  readonly ref: Readonly<{
    readonly id: string;
  }>;
}>;

export function transactionTimingFacts(
  startedAt: number,
  endedAt: number,
): Readonly<{
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMillis: number;
}> {
  return Object.freeze({
    startedAt,
    endedAt,
    durationMillis: Math.max(endedAt - startedAt, 0),
  });
}

export function transactionPreviewReceiptFacts<Layer extends TransactionPreviewLayerLike>(
  generation: number,
  queueKey: string,
  previewLayers: ReadonlyArray<Layer>,
): ReadonlyArray<
  Readonly<{
    readonly generation: number;
    readonly queueKey: string;
    readonly refId: string;
    readonly previewIndex: number;
    readonly previewCount: number;
  }>
> {
  return Object.freeze(
    previewLayers.map((previewLayer, index) =>
      Object.freeze({
        generation,
        queueKey,
        refId: previewLayer.ref.id,
        previewIndex: index + 1,
        previewCount: previewLayers.length,
      }),
    ),
  );
}

export function transactionRollbackReceiptFacts<Layer extends TransactionPreviewLayerLike>(
  generation: number,
  queueKey: string,
  previewLayers: ReadonlyArray<Layer>,
): ReadonlyArray<
  Readonly<{
    readonly generation: number;
    readonly queueKey: string;
    readonly refId: string;
    readonly rollbackIndex: number;
    readonly rollbackCount: number;
  }>
> {
  const rollbackLayers = [...previewLayers].reverse();
  return Object.freeze(
    rollbackLayers.map((previewLayer, index) =>
      Object.freeze({
        generation,
        queueKey,
        refId: previewLayer.ref.id,
        rollbackIndex: index + 1,
        rollbackCount: rollbackLayers.length,
      }),
    ),
  );
}

export function transactionRoutedEventType(event: FlowEvent | undefined): string | undefined {
  return event?.type;
}
