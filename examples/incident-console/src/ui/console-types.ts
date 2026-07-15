import type { useActor } from "flow-state/react";

import { incidentConsoleMachine } from "../features/incidents/machine";

export type IncidentConsoleActor = ReturnType<typeof useActor<typeof incidentConsoleMachine>>;
export type IncidentConsoleSend = IncidentConsoleActor["send"];
