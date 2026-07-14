import { Data } from "effect";
import type { Option } from "effect";

export type ProjectCursor = -20 | -16 | -12 | -8 | -4 | 0 | 4 | 8 | 12 | 16 | 20;

export interface Project {
  readonly id: number;
  readonly name: string;
  readonly revision: number;
}

export interface ProjectPage {
  readonly cursor: ProjectCursor;
  readonly projects: readonly Project[];
  readonly previousCursor: Option.Option<ProjectCursor>;
  readonly nextCursor: Option.Option<ProjectCursor>;
}

export class ProjectPageUnavailable extends Data.TaggedError("ProjectPageUnavailable")<{
  readonly cursor: ProjectCursor;
  readonly message: string;
}> {}
