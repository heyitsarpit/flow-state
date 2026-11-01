# Brief the user on this chat

Report results since the user's last message before the briefing request, or their stated
checkpoint.
Include earlier decisions still waiting on the human. Worker reports and notifications are not user
messages.
Use this mode for a current-chat catch-up; skip the broader history search.

1. Gather completed work, worker findings, material changes, and outstanding decisions in this chat.
   Check relevant live Git, worker, PR, and CI state through available read-only tools.
   Name running work and unavailable checks. Do not start jobs, launch apps, edit files, or post
   messages.
2. Separate decisions only the human can make from work the agent can continue under existing
   authority.
   Do not turn unfinished agent work into a user action item.
3. Open with the number of human action items, or say none. Report the most consequential results
   first.
   Explain what each result changes for the user; omit routine steps with no useful result.
4. For each human decision, state the choice, why it matters now, options, tradeoffs,
   recommendation,
   and what remains blocked without an answer. Do not manufacture a default or infer approval from
   silence.
   Use an existing comparison or visual when it helps; plain prose is enough for a simple decision.
5. Name agent-owned remaining work in one line. Link existing evidence and keep familiar names for
   branches,
   PRs, and workers. If nothing changed and nothing waits on the human, say so and stop.

Return the briefing without starting the next workflow. Broader historical recall keeps its existing
method.
