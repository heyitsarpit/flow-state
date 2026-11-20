# Templates

One per default kind. Replace every `<…>`; keep the shape. Syntax: skill:policy-records.

## Proposal

`wiki/proposals/YYYY-MM-DD-<slug>.md`

````md
---
proposal <name>
status draft <YYYY-MM-DD>
---
# <Title>

**Bottom line:** <the verdict in one sentence>. <What it produces.>

## 1. <First decision>

**<Lead term>** [proposed: agent <YYYY-MM-DD>]. <The rule, stated as a fact.> Why: <reason>.
Reverse: <how to undo it>.

Before:

```ts
<current code, complete>
```

After:

```ts
<proposed code, complete; mark names // NEW, // renamed, // existing, // user-defined>
```

Added: <…>. Dropped: <…>.

## 2. <A question still to ask>

**<Lead term>** [open: <YYYY-MM-DD>; recommend A]
- A. <option and its main trade-off>
- B. <option and its main trade-off>

## Considered and dropped

- **<Option>:** <why it lost>.

## Risks

- **<Risk>:** <what could go wrong, and what catches it>.
````

## Review

`wiki/reviews/YYYY-MM-DD-<slug>.md`

```md
---
review <name>
status open <YYYY-MM-DD>
---
# <What was reviewed, at which revision>

**Bottom line:** <verdict>. <How many findings, how many blocking.>

## Findings

**<Finding>** [accepted: agent <role> <YYYY-MM-DD>]. <What is wrong, with file:line evidence.>
Why: <why it is real>. Reverse: <how to undo the fix>. Fix: @task.<EPIC>.<T>.

**<Finding>** [rejected: agent <role> <YYYY-MM-DD>]. <What was claimed.> Why: <why it is not
real>. Reverse: <how to reopen it>.
```

## Question list

`wiki/proposals/YYYY-MM-DD-<slug>.md`

```md
---
questions <name>
status open <YYYY-MM-DD>
---
# <What the questions are for>

**Bottom line:** <how many, which block work, who answers>.

1. **<Question title>** [open: <YYYY-MM-DD>; recommend A]. <The question.>
   - A. <option>
   - B. <option>
```

## Revisit

`wiki/revisit.md`, for deferred items that have no home record.

```md
---
revisit <name>
---
# Revisit

## <Item>

**<Item>** [deferred: user <YYYY-MM-DD>]. <What was deferred and why.> Reopen if: <the evidence
that would bring it back>.

<Prior art, in full, if any.>
```
