# Pause with a resume checkpoint

Stop at a safe boundary and leave enough durable state for a cold-start coworker to continue.
Use for an explicit pause or required handoff. A request to keep going does not trigger a pause.

## Coordinator boundary

1. Stop dispatching new work. Ask each owner to finish its current atomic step or back out only
   that step's owned changes.
   Stop owned workers through supported controls; collect their completed outputs and partial state.
   Record workers or external jobs that could not stop. Do not interrupt unrelated work.

## Resource preservation

2. Resource owners save owned edits and evidence. Inspect branch, revision, worktree,
   staged/unstaged state, and relevant untracked files. Preserve partial results; distinguish
   verified from unverified work. Do not commit, push, publish, or discard work merely to make the
   tree look clean.

## Record checkpoint

3. The record writer applies [keep-intent-aligned](../../keep-intent-aligned/SKILL.md) to material
   outstanding work. Update the owning Task through its procedure, or use an existing supporting
   note when no Task exists. Keep substantial supporting notes in workflow/reference/ or the
   project's existing location.
4. The record writer records intent, decisions, exact state, completed checks and conditions,
   unresolved issues, resource ownership, evidence paths, and the first resume action. Link prior
   records instead of copying them. Keep the checkpoint durable and accessible to the next coworker;
   state any persistence limitation.

## Coordinator handback

5. Return the checkpoint path, saved versus unsaved state, remaining worker status, and first resume
   action.
   On resumption, assign [recall](../../recall/SKILL.md) to recover state; assign checking of
   consequential claims before accepting delayed outputs.

A checkpoint records a stop, not completion or acceptance. Stale evidence remains stale after a
pause.
