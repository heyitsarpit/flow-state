# Behavioral Invariants — illustrative Spec fragment

Define names and observation boundaries; add actual Requirement references in the owning Spec.

```spec
invariants
    I1 Within each Epic, unique(tasks.map(t => t.id)).
    I2 For every row in response.rows, row.tenantId == request.tenantId.
    I3 At queue operation boundaries, 0 <= items.length <= capacity.
    I4 upload.state == published implies upload.validation == passed.
    I5 run.status == succeeded implies every(run.steps, s => s.status == succeeded).
```
