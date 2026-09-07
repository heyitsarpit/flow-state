import { Predicate, SchemaIssue } from "effect";

// RETURN_TYPE: Recursive issue descent requires an explicit field result type; removal produces TS7023.
export const firstConfigurationField = (issue: SchemaIssue.Issue): string | undefined => {
  if (issue._tag === "Pointer") {
    const field = issue.path[0];
    return Predicate.isString(field) ? field : undefined;
  }
  if ("issues" in issue) {
    const first = issue.issues.at(0);
    return first === undefined ? undefined : firstConfigurationField(first);
  }
  if ("issue" in issue) return firstConfigurationField(issue.issue);
  return undefined;
};
