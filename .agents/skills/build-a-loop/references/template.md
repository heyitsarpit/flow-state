# Loop template

Write the loop into the `draft` Epic file after its contract fields and `skill` (the pin
skill:to-epic wrote), in this order: `run`, `instructions`, `cadence`, `stops`; notes go in `log.task`. Replace
every `<...>` and keep every other line. Text lines sit at one indentation, because `workflow
format` does not keep hanging indents. In `instructions`, "agents at once" is how many agents may
run at the same time, and "always alone" is work that runs with no other agent or process beside
it, such as a benchmark. Decisions in notes follow skill:policy-records's decision convention.

```text
run
    To start: "run the loop in workflow/tasks/<EPIC>/epic.task". You are the orchestrator: you
    start, track and route agents; you never build.
    1. Read this file, `workflow show @epic.<EPIC> --tree`, and the records the current Task
    links; on a resume, run skill:catch-up first. If status is not active or the loop fields are
    missing, stop and tell the user.
    2. Current Task: the in_progress one, otherwise `workflow next --epic <EPIC>`.
    3. Create the session cron from cadence; without one, run its prompt at each wake (R25).
    4. Keep the machine awake for the run (R26).
    5. Recover the real agent state: agents and processes alive, branch, last checkpoint, and
    uncommitted work with its owner.
    6. Note "Run started" or "Run resumed": revision, current Task, live agents, first action.
    7. Start or resume one building lead, set its Task in_progress, and confirm activity within a
    minute.
    Rules: follow skill:build-a-loop#rules, skill:policy-delegation and skill:policy-verification at the
    library revision in skill; instructions override their defaults. If the library is at
    another revision, read the pinned one from the library's Git history, or ask the user.
    Before changing the loop fields (run, instructions, cadence, stops), read skill:build-a-loop at the
    pinned revision; before adding or editing a Task, read skill:to-task (and skill:to-epic for a
    phase); before adding a phase, read skill:to-epic.
instructions
    Lead and sidecar models: <pair>, detected <date>; told the user <where>.
    Constraints: the Epic's Constraints section. Limits: its Limits section.
    <rule overridden, such as R35's convergence threshold>: <value> (<source, date>).
    Agents at once: <n>. Always alone: <for example, benchmarks>. Command time limit: <seconds>.
cadence
    Review every <60> minutes on the latest checkpoint. Session cron `<7 * * * *>`.
    Prompt: "<the whole review procedure of R22, with this project's numbers>"
    Quiet rule: a wake that finds nothing writes no note and sends no message.
stops
    <Decisions the user kept.>
```

Then a note in `log.task` (`workflow edit @epic.<EPIC> --now --text note="..."`):

```text
note <UTC timestamp>
    Loop written with skill:build-a-loop; models: <pair>, because <agent harness>.
```
