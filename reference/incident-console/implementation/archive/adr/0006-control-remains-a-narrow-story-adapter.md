# Control remains a narrow Story adapter

Status: superseded by ADR-0008. ADR-0007 is also historical and superseded.

This decision was revisited during the implementation-spec grill. The existing `control` abstraction
remains migration evidence, but the final model replaces it with complete service Implementations and
the Story builder's `.run()` boundary, as recorded in ADR-0008 and the active contracts.
