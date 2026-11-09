# Migrate a roadmap folder to an Epic

A one-off migration for projects set up with an older version of this skill library, which wrote
`workflow/roadmaps/<name>/roadmap.md` and `progress.md`. Today the same content is an Epic written
by skill:to-epic, with its loop written by skill:to-loop.

Convert the folder into the Epic, its phases, its Tasks and its loop, then delete the folder.
Convert between two builder checkpoints (commits the building agent makes at stable points), so no
agent writes the old files mid-way. Before deleting anything, give a fresh agent the old files,
this table and the new records, and have it confirm that nothing was lost.

| Old content                               | New place                                                                                                       | Kept, moved or dropped |
|-------------------------------------------|-----------------------------------------------------------------------------------------------------------------|------------------------|
| Header: status, goal, built-from          | Epic `title`, `status`, `skill`, top of `description`                                                           | moved                  |
| Header: version                           | the latest amendment note; git history for older versions                                                       | moved                  |
| Header: shape confirmed                   | the Epic's first note, quoting the user, with where and when                                                    | moved                  |
| Header: runner                            | Epic `instructions` (`Who runs the loop:`); an agent orchestrator follows `run`                                 | moved                  |
| Header: records                           | Epic description, Records line: Plans and Specs as `@` links; design and proposal files as `code:` links       | moved                  |
| Header: source of truth, by area          | Epic `instructions` (`Source of truth, by area:`), one item per area, with until when it holds                  | moved                  |
| Header: locations                         | Epic description, Locations line                                                                                | moved                  |
| Header: progress                          | none: the queue is derived and the history is notes                                                             | dropped, derived       |
| The user's constraints                    | Epic `instructions`, each with its source                                                                       | moved                  |
| Glossary                                  | Epic description, last section                                                                                  | moved                  |
| Stops and the review queue                | Epic `stops`; decisions pending the user's read are notes                                                       | moved                  |
| How to run, and the Resume block          | Epic `run`                                                                                                      | moved, shorter         |
| Stages table                              | Epic description                                                                                                | moved                  |
| Phase cards                               | the phase's `description`; old classes map to the new ones (below)                                              | moved                  |
| Guarantee map                             | the coverage records of the phase's verification suites, in the Plan's `verification` (skill:policy-verification) | moved                |
| Authority                                 | Epic description                                                                                                | moved                  |
| Agents and Budget                         | Epic `instructions` (this project's values over skill:to-loop#rules), description Budget section               | merged                 |
| Review timing and the session cron        | Epic `cadence`: the cron expression, prompt and quiet rule                                                      | moved, made explicit   |
| Decisions about this run                  | notes (new ones); git history (old ones)                                                                        | moved                  |
| Amendments                                | a note each: date, judge, change, commit id; `instructions` edited to match                                     | moved, shorter         |
| Runner rules, copied                      | none: `run` links skill:to-loop#rules at the pinned revision; this project's changes go in `instructions`       | dropped, linked        |
| Replaced text kept inline                 | git history, linked from the note's commit id                                                                   | dropped from the file  |
| Phases checklist                          | derived: `workflow show @epic.<EPIC> --tree`                                                                    | dropped, derived       |
| Queue and next action                     | derived: `workflow next --epic <EPIC>`                                                                          | dropped, derived       |
| Per-task notes, results, timings          | that Task's comments                                                                                            | moved                  |
| Change proposals                          | the new Task itself, with its source, judge and state in the description                                        | merged                 |
| Failure ledger                            | a comment on the failing part's Task, plus a note                                                               | moved                  |
| Calls for the user's read                 | notes in skill:policy-records's decision convention, linking what they're about                                 | moved                  |
| Agents running, usage                     | notes, as they change                                                                                           | moved                  |
| Log                                       | notes plus git log (builders commit each checkpoint)                                                            | moved                  |

Old phase classes map to the new ones:

| Old class                 | New class and kind                                                                         |
|---------------------------|--------------------------------------------------------------------------------------------|
| Small ticket              | `verifiable`, kind `ticket`                                                                |
| Performance work          | `verifiable`, kind `performance`, after a `verification-suite` phase if no proven benchmark suite exists |
| Readily verifiable goal   | `verifiable`, kind `feature`                                                               |
| Not readily verifiable    | `not-readily-verifiable`, kind `verification-suite`, followed by the verifiable work        |
| Judgment goal             | `non-verifiable`                                                                           |
