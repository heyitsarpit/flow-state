import { describe, expect, it } from "vite-plus/test";
import { Diagnostic } from "../../src/index.ts";

describe("the closed code list (Diagnostics R7)", () => {
  it("Diagnostics R7: the public union holds exactly the codes Flow produces today", () => {
    expect([...Diagnostic.fields.code.literals].toSorted()).toEqual(
      [
        "SchemaValidation",
        "InvalidConfiguration",
        "Defect",
        "GuardDefect",
        "TwoDefaults",
        "ImpureDefault",
        "IdentityFieldOptional",
        "ReservedStateName",
        "UnknownNotUncertain",
        "RuntimeNotReady",
        "RuntimeDisposed",
        "ConflictingActorRef",
        "ForeignActorRef",
        "MissingContextProvider",
        "ContextCycle",
        "BlockedByDependents",
        "InvalidEvent",
        "RecordUndecodable",
        "SharedContract",
        "KeyFieldOptional",
        "StorageFailure",
        "CleanupFailed",
      ].toSorted(),
    );
  });
});
