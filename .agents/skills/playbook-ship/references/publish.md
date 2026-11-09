# Publish a pull request

1. Resolve the repository, forge, current branch and base, uncommitted work, and existing matching
   PRs. Use a supported built-in PR tool when its instructions require it; keep one adapter for all
   lifecycle operations. Preserve unrelated edits. Use an isolated checkout when the branch or
   scope requires it.
2. Inspect the complete diff and acceptance evidence. Create scoped, ordered commits within the
   request. Verify required project checks at the actual submitted revision; disclose failed or
   unrun gates. Return product failures and missing required proof to the user or the Task's
   author; do not repair code while preparing delivery. Refresh evidence after patch or base edits.
3. For a stack, target the actual parent branch. Verify the child includes its parent's exact
   current tip before publishing the dependency diff. Root changes target the intended trunk.
   One owner controls shared rebases, retargets, and stack assembly; a verified tip does not make
   an unverified parent ready.
4. Write the description under `policy-writing`: the problem, resulting behavior, scope, material
   risks and tradeoffs, and actual verification. Use the repository template and requested title
   style. Link detailed evidence instead of making the description a lab notebook.
5. Create or update the PR in the requested draft or ready state. Read back the URL, base, head,
   and state. After an ambiguous write, reconcile the matching target before retrying; reuse an
   existing PR. Repeat only when no write occurred or the operation is documented as idempotent.
6. Register the PR with the harness when supported. Return its URL, submitted revision, and
   remaining gates. For a draft with open gates, disclose them; never label a change ready while
   required gates remain unmet.
