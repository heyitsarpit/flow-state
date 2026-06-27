import {
  Cause,
  Effect,
  Exit,
  Layer,
  Option,
  Redacted,
  Request,
  RequestResolver,
  Schema,
} from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  ApprovalRequestSchema,
  LaunchProjectId,
  LaunchProjectSchema,
  ProjectConflict,
  fixtureApproval,
  fixtureProject,
  projectDraftFrom,
} from "./domain";
import type { LaunchProjectId as LaunchProjectIdType, Permissions } from "./domain";
import { ProjectApi, saveProject } from "./services";

interface GetPermissions extends Request.Request<Permissions> {
  readonly _tag: "GetPermissions";
  readonly projectId: LaunchProjectIdType;
}

const GetPermissions = Request.tagged<GetPermissions>("GetPermissions");

const requestPermissions = (
  projectId: LaunchProjectIdType,
  resolver: RequestResolver.RequestResolver<GetPermissions>,
): Effect.Effect<Permissions> => Effect.request(GetPermissions({ projectId }), resolver);

const createProjectApiLayer = (calls: string[]) =>
  Layer.succeed(
    ProjectApi,
    ProjectApi.of({
      getProject: (id) => Effect.succeed({ ...fixtureProject, id }),
      listComments: () => Effect.succeed([]),
      saveProject: (params) =>
        Effect.sync(() => {
          calls.push(params.draft.name);
          return {
            ...fixtureProject,
            ...params.draft,
            version: params.baseVersion + 1,
          };
        }),
    }),
  );

describe("Launch Workspace Effect service contracts", () => {
  it("decodes domain payloads through Schema and rejects invalid wire shapes", () => {
    const decoded = Schema.decodeUnknownSync(LaunchProjectSchema)({
      ...fixtureProject,
      id: "launch-1",
    });
    const invalid = Schema.decodeUnknownExit(LaunchProjectSchema)({
      ...fixtureProject,
      version: "7",
    });

    expect(decoded).toMatchObject({
      id: fixtureProject.id,
      version: fixtureProject.version,
    });
    expect(Exit.isFailure(invalid)).toBe(true);
  });

  it("decodes approval redaction at the schema boundary without leaking the raw note", () => {
    const decoded = Schema.decodeUnknownSync(ApprovalRequestSchema)({
      ...fixtureApproval,
      id: "approval-1",
      projectId: "launch-1",
      customerNote: "Sensitive customer launch note",
    });

    expect(Redacted.value(decoded.customerNote)).toBe("Sensitive customer launch note");
    expect(JSON.stringify(decoded.customerNote)).not.toContain("Sensitive customer");
  });

  it("normalizes project drafts before service writes and fails validation before API access", async () => {
    const calls: string[] = [];
    const layer = createProjectApiLayer(calls);
    const validDraft = {
      ...projectDraftFrom(fixtureProject),
      name: "  Atlas v2 launch  ",
      summary: "  Updated launch brief  ",
    };
    const saved = await Effect.runPromise(
      saveProject({
        id: fixtureProject.id,
        draft: validDraft,
        baseVersion: fixtureProject.version,
      }).pipe(Effect.provide(layer)),
    );
    const validationMessage = await Effect.runPromise(
      saveProject({
        id: fixtureProject.id,
        draft: { ...validDraft, name: "   " },
        baseVersion: fixtureProject.version,
      }).pipe(
        Effect.catchTag("ProjectValidation", (error) => Effect.succeed(error.message)),
        Effect.provide(layer),
      ),
    );

    expect(saved).toMatchObject({
      name: "Atlas v2 launch",
      summary: "Updated launch brief",
    });
    expect(calls).toEqual(["Atlas v2 launch"]);
    expect(validationMessage).toBe("Project name is required.");
  });

  it("keeps project conflicts as typed failures in the Effect error channel", async () => {
    const conflictLayer = Layer.succeed(
      ProjectApi,
      ProjectApi.of({
        getProject: (id) => Effect.succeed({ ...fixtureProject, id }),
        listComments: () => Effect.succeed([]),
        saveProject: () =>
          Effect.fail(
            new ProjectConflict({
              serverVersion: fixtureProject.version,
              serverProject: fixtureProject,
            }),
          ),
      }),
    );
    const exit = await Effect.runPromiseExit(
      saveProject({
        id: fixtureProject.id,
        draft: projectDraftFrom(fixtureProject),
        baseVersion: fixtureProject.version,
      }).pipe(Effect.provide(conflictLayer)),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.findErrorOption(exit.cause);
      expect(Option.isSome(failure) ? failure.value._tag : "none").toBe("ProjectConflict");
    }
  });

  it("batches concurrent service requests through Effect RequestResolver", async () => {
    const secondProjectId = LaunchProjectId("launch-2");
    const batches: LaunchProjectIdType[][] = [];
    const resolver = RequestResolver.fromFunctionBatched<GetPermissions>((entries) => {
      batches.push(entries.map((entry) => entry.request.projectId));
      return entries.map(() => ({
        canEditProject: true,
        canUploadAssets: true,
        canRequestApproval: false,
        canRunAssistant: true,
      }));
    });

    const permissions = await Effect.runPromise(
      Effect.all(
        [
          requestPermissions(fixtureProject.id, resolver),
          requestPermissions(secondProjectId, resolver),
        ],
        { concurrency: "unbounded" },
      ),
    );

    expect(permissions.map((entry) => entry.canRequestApproval)).toEqual([false, false]);
    expect(batches).toEqual([[fixtureProject.id, secondProjectId]]);
  });
});
