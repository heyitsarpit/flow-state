---
name: reimagine-depth
description: >-
  Deepen a task through professional methods, primary evidence, and independent verification,
  then rewrite the task prompt to ask for that. Use to make a task more rigorous rather than
  broader.
metadata:
  kind: procedure
  applies:
    - policy-writing
---

# Deepen

Use this skill to rewrite a task prompt so it asks for stronger methods, primary evidence, and an
independent check, while keeping the task's goal and scope.

Investigate the task and the project's actual material, then answer these four questions:

1. **What would a top professional in this field do here, within the same scope, that the task
   does not ask for?** Name the field first.
2. **What raw material would they start from,** instead of what has already been digested or
   summarized?
3. **Which specific methods and tools would they use?**
4. **What independent evidence would show the result is right?** Name a check that
   does not depend on your own judgment: an existing test suite, a measurement, an outside source,
   or another reviewer.

Then rewrite the task prompt so it asks for exactly that: same goal and scope, with the stronger
method, raw material, and independent check built in. Follow `policy-writing` when you rewrite it.

## Return

Use this shape:

1. The four answers, numbered as above, each citing the evidence you looked at.
2. **Rewritten prompt:** the new task prompt as a quoted block, for example:

   > Investigate the timeout using request traces and the retry configuration, not the error
   > summary. Keep the existing timeout policy. Confirm the cause with a deterministic reproduction.

3. Anything you could not verify.

Do not run the rewritten task or expand its scope.
