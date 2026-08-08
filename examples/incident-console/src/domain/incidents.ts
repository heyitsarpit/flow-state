import { Data, Result, Schema } from "effect";

export const severityValues = ["critical", "high", "medium", "low"] as const;
export const statusValues = ["open", "acknowledged", "resolved"] as const;
export const serviceValues = ["api", "billing", "identity", "search"] as const;
export const assigneeValues = ["Avery", "Jordan", "Morgan", "Riley"] as const;
export const runbookStatusValues = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const runbookStepStatusValues = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export const incidentEventTypeValues = [
  "created",
  "assignment",
  "status",
  "note",
  "runbook",
] as const;

export const SeveritySchema = Schema.Literals(severityValues);
export const IncidentStatusSchema = Schema.Literals(statusValues);
export const ServiceSchema = Schema.Literals(serviceValues);
export const AssigneeSchema = Schema.Literals(assigneeValues);

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

export const ServiceFilterSchema = Schema.Union([ServiceSchema, Schema.Literal("all")]);
export const SeverityFilterSchema = Schema.Union([SeveritySchema, Schema.Literal("all")]);
export const StatusFilterSchema = Schema.Union([IncidentStatusSchema, Schema.Literal("all")]);
export const AssigneeFilterSchema = Schema.Union([
  AssigneeSchema,
  Schema.Literals(["all", "unassigned"] as const),
]);

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

export const IncidentCommand = {
  assign: (assignee: string | null) => ({ _tag: "Assign", assignee }) as const,
  changeStatus: (status: IncidentStatus) => ({ _tag: "ChangeStatus", status }) as const,
};

export type IncidentCommand = ReturnType<(typeof IncidentCommand)[keyof typeof IncidentCommand]>;

export class IncidentCommandRejection extends Data.TaggedError("IncidentCommandRejection")<{
  readonly reason: "already-in-state" | "invalid-status-transition";
  readonly message: string;
}> {}

export const decideIncidentCommand = (
  incident: Incident,
  command: IncidentCommand,
): Result.Result<IncidentPatch, IncidentCommandRejection> => {
  if (command._tag === "Assign") {
    return Result.succeed({ expectedVersion: incident.version, assignee: command.assignee });
  }

  const accepted =
    (incident.status === "open" && command.status === "acknowledged") ||
    (incident.status !== "resolved" && command.status === "resolved") ||
    (incident.status === "resolved" && command.status === "open");
  if (!accepted) {
    return Result.fail(
      new IncidentCommandRejection({
        reason:
          command.status === incident.status ? "already-in-state" : "invalid-status-transition",
        message:
          command.status === incident.status
            ? `Incident is already ${command.status}`
            : `A ${incident.status} incident cannot move directly to ${command.status}`,
      }),
    );
  }
  return Result.succeed({ expectedVersion: incident.version, status: command.status });
};

export const applyIncidentPatch = (incident: Incident, patch: IncidentPatch): Incident => ({
  ...incident,
  ...(patch.assignee === undefined ? {} : { assignee: patch.assignee }),
  ...(patch.status === undefined ? {} : { status: patch.status }),
});

export const IncidentEventSchema = Schema.Struct({
  id: Schema.String,
  incidentId: Schema.String,
  type: Schema.Literals(incidentEventTypeValues),
  message: Schema.String,
  at: Schema.String,
  version: Schema.Number,
});

export type IncidentEvent = typeof IncidentEventSchema.Type;

export const RunbookStepSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  status: Schema.Literals(runbookStepStatusValues),
});

export const RunbookSchema = Schema.Struct({
  id: Schema.String,
  incidentId: Schema.String,
  status: Schema.Literals(runbookStatusValues),
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

export const faultNameValues = [
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
] as const;

export const FaultNameSchema = Schema.Literals(faultNameValues);

export type FaultName = typeof FaultNameSchema.Type;

export const FaultRequestSchema = Schema.Struct({ fault: FaultNameSchema });
export const resetSeedValues = ["normal", "empty"] as const;
export const ResetRequestSchema = Schema.Struct({
  seed: Schema.Literals(resetSeedValues),
});

export const decode = <SchemaValue extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaValue,
  value: unknown,
): SchemaValue["Type"] => Schema.decodeUnknownSync(schema)(value);
