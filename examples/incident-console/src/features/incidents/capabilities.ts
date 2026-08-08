import { Result } from "effect";

import {
  IncidentCommand,
  decideIncidentCommand,
  type Incident,
  type IncidentCommandRejection,
  type IncidentStatus,
} from "../../domain/incidents";
import { IncidentStates, type IncidentConsoleState } from "./vocabulary";

export interface IncidentCapabilities {
  readonly back: boolean;
  readonly refreshQueue: boolean;
  readonly refreshDetail: boolean;
  readonly filterQueue: boolean;
  readonly openIncident: boolean;
  readonly mutate: boolean;
  readonly startRunbook: boolean;
  readonly cancelRunbook: boolean;
  readonly replaceRunbook: boolean;
}

export const capabilitiesFor = (state: IncidentConsoleState): IncidentCapabilities => ({
  back: state !== IncidentStates.queue,
  refreshQueue: state === IncidentStates.queue,
  refreshDetail: state === IncidentStates.detail,
  filterQueue: state === IncidentStates.queue,
  openIncident: true,
  mutate: state === IncidentStates.detail,
  startRunbook: state === IncidentStates.detail,
  cancelRunbook: state === IncidentStates.runbook,
  replaceRunbook: state === IncidentStates.runbook,
});

export interface CommandCapability {
  readonly enabled: boolean;
  readonly reason: string | undefined;
}

const fromDecision = (
  decision: Result.Result<unknown, IncidentCommandRejection>,
): CommandCapability =>
  Result.match(decision, {
    onSuccess: () => ({ enabled: true, reason: undefined }),
    onFailure: ({ message }) => ({ enabled: false, reason: message }),
  });

export const assignmentCapability = (
  incident: Incident,
  assignee: string | null,
): CommandCapability =>
  fromDecision(decideIncidentCommand(incident, IncidentCommand.assign(assignee)));

export const statusCapability = (incident: Incident, status: IncidentStatus): CommandCapability =>
  fromDecision(decideIncidentCommand(incident, IncidentCommand.changeStatus(status)));
