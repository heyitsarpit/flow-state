# Flow State rewrite integration tests

These tests are the concrete behavior target for the rewrite. They should cross
the public route boundaries and use the same production runtime ownership as live
React, server, Story, CLI, and persistence consumers.

The behavior matrix is maintained in
`INTEGRATION_BEHAVIOR_MATRIX.md`; implementation Beads should link each test
slice to a matrix entry and its contract/proof IDs.
