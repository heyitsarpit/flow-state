import { Schema } from "effect";

export const severityValues = ["critical", "high", "medium", "low"] as const;
export const statusValues = ["open", "acknowledged", "resolved"] as const;
export const serviceValues = ["api", "billing", "identity", "search"] as const;
export const assigneeValues = ["Avery", "Jordan", "Morgan", "Riley"] as const;

export const SeveritySchema = Schema.Literals(severityValues);
export const IncidentStatusSchema = Schema.Literals(statusValues);
export const ServiceSchema = Schema.Literals(serviceValues);

export const IncidentSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.String,
  service: ServiceSchema,
  severity: SeveritySchema,
  status: IncidentStatusSchema,
  assignee: Schema.NullOr(Schema.String),
  version: Schema.Number,
  updatedAt: Schema.String,
});

export type Incident = typeof IncidentSchema.Type;
export type IncidentSeverity = typeof SeveritySchema.Type;
export type IncidentStatus = typeof IncidentStatusSchema.Type;
export type IncidentService = typeof ServiceSchema.Type;

export const IncidentFiltersSchema = Schema.Struct({
  service: Schema.optionalKey(ServiceSchema),
  severity: Schema.optionalKey(SeveritySchema),
  status: Schema.optionalKey(IncidentStatusSchema),
  assignee: Schema.optionalKey(Schema.String),
  cursor: Schema.optionalKey(Schema.String),
});

export type IncidentFilters = typeof IncidentFiltersSchema.Type;

export const IncidentPageSchema = Schema.Struct({
  incidents: Schema.Array(IncidentSchema),
  nextCursor: Schema.NullOr(Schema.String),
});

export type IncidentPage = typeof IncidentPageSchema.Type;

export const IncidentPatchSchema = Schema.Struct({
  expectedVersion: Schema.Number,
  assignee: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.optionalKey(IncidentStatusSchema),
});

export type IncidentPatch = typeof IncidentPatchSchema.Type;

export const IncidentEventSchema = Schema.Struct({
  id: Schema.String,
  incidentId: Schema.String,
  type: Schema.Literals(["created", "assignment", "status", "note", "runbook"] as const),
  message: Schema.String,
  at: Schema.String,
  version: Schema.Number,
});

export type IncidentEvent = typeof IncidentEventSchema.Type;

export const RunbookStepSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(["pending", "running", "succeeded", "failed", "cancelled"] as const),
});

export const RunbookSchema = Schema.Struct({
  id: Schema.String,
  incidentId: Schema.String,
  status: Schema.Literals(["queued", "running", "succeeded", "failed", "cancelled"] as const),
  steps: Schema.Array(RunbookStepSchema),
});

export type Runbook = typeof RunbookSchema.Type;

export const RunbookAcceptedSchema = Schema.Struct({ runId: Schema.String });
export type RunbookAccepted = typeof RunbookAcceptedSchema.Type;

export const ApiErrorSchema = Schema.Struct({
  code: Schema.Literals([
    "bad_request",
    "not_found",
    "version_conflict",
    "unavailable",
    "decode_failure",
  ] as const),
  message: Schema.String,
  current: Schema.optionalKey(IncidentSchema),
});

export type ApiError = typeof ApiErrorSchema.Type;

export const FaultNameSchema = Schema.Literals([
  "delayed-response",
  "refresh-503",
  "malformed-detail",
  "remove-before-detail",
  "sse-disconnect",
  "timeline-burst",
  "delayed-patch",
  "delayed-runbook",
  "shift-before-list",
  "runbook-failure",
  "runbook-cancel-race",
] as const);

export type FaultName = typeof FaultNameSchema.Type;

export const FaultRequestSchema = Schema.Struct({ fault: FaultNameSchema });
export const ResetRequestSchema = Schema.Struct({
  seed: Schema.Literals(["normal", "empty"] as const),
});

export const decode = <SchemaValue extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaValue,
  value: unknown,
): SchemaValue["Type"] => Schema.decodeUnknownSync(schema)(value);
