# Investigate connected sources

Use only sources requested by the user or directly linked by relevant project evidence.
Resolve supported read-only tools and the authorized workspace before searching.
Do not scan unrelated accounts or send messages to obtain rationale.

| Source | Search for | Preserve |
|---|---|---|
| Forge PRs | Review discussion and linked commits | PR URL, base/head, author, time |
| Slack | Decision threads and incident discussion | Permalink, thread context, actor, time |
| Linear | Requirement, issue, and linked changes | Issue ID, status, decision comments |
| Notion | Design documents and decision records | Page ID, revision or date, quoted section |
| Sentry | Matching incident and affected release | Event ID, release, occurrence conditions |
| Datadog | Matching traces, metrics, and logs | Query, time range, environment, trace ID |
| Databricks | Relevant query or workload evidence | Query/run ID, inputs, time, result limits |

Anchor searches to the local decision, revision, incident, or supplied object ID.
Distinguish recorded intent from operational observations and your inference.
Read surrounding context; preserve contradictions. Return citations, searched scope, and gaps.
Unavailable access limits the answer; never substitute invented source content.
