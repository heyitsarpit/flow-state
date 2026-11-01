# Verify an existing fix

1. Identify the claimed fix revision, baseline, report input, runtime, and expected result.
2. Reproduce the reported failure on the baseline using the real public surface.
   If the baseline cannot demonstrate the failure, return inconclusive evidence.
3. Run the same scenario on the fix revision in owned isolated state.
   Inspect the discriminating output or side effect; repeat when state or timing affects the claim.
4. Report fixed, still failing, or inconclusive with revisions and conditions.
   Preserve captures before cleanup. Return an insufficient fix to the owner without a competing
   patch.
