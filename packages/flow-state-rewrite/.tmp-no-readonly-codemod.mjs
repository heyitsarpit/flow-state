import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";

const packageRoot = path.resolve("packages/flow-state-rewrite");

const project = new Project({ skipAddingFilesFromTsConfig: true });

project.addSourceFilesAtPaths([
  path.join(packageRoot, "src/**/*.ts"),
  path.join(packageRoot, "src/**/*.tsx"),
  path.join(packageRoot, "test/**/*.ts"),
  path.join(packageRoot, "test/**/*.tsx"),
]);

const sourceFiles = project.getSourceFiles();

const exceptionMarker = "NO_READONLY_CODEMOD:";

const isProtected = (node) => {
  const lines = node.getSourceFile().getFullText().split(/\r?\n/u);
  const candidates = [node, ...node.getAncestors()];

  return candidates.some((candidate) => {
    const lineIndex = candidate.getStartLineNumber() - 1;

    return [lines[lineIndex - 1], lines[lineIndex]].some((line) => line?.includes(exceptionMarker));
  });
};

const counts = {
  property: 0,
  index: 0,
  parameter: 0,
  classProperty: 0,
  typeOperator: 0,
  mappedType: 0,
  readonlyUtility: 0,
  readonlyArray: 0,
  readonlyMap: 0,
  readonlySet: 0,
  customAliases: 0,
};

const customNames = new Map([
  ["ReadonlyCanonicalAtDepth", "CanonicalKeyValueAtDepth"],
  ["ReadonlyCanonical", "CanonicalKeyValue"],
  ["ReadonlySelection", "Selection"],
]);

for (const sourceFile of sourceFiles) {
  for (const alias of sourceFile.getTypeAliases()) {
    if (isProtected(alias)) continue;
    const renamed = customNames.get(alias.getName());

    if (renamed) {
      alias.getNameNode().rename(renamed);
      counts.customAliases += 1;
    }
  }
}

for (const sourceFile of sourceFiles) {
  const references = sourceFile
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .sort((left, right) => right.getStart() - left.getStart());

  for (const reference of references) {
    if (reference.wasForgotten()) continue;

    if (isProtected(reference)) continue;

    const typeName = reference.getTypeName().getText();

    if (typeName === "Readonly") {
      const typeArguments = reference.getTypeArguments();

      if (typeArguments.length !== 1) {
        throw new Error("Unexpected Readonly utility shape: " + reference.getText());
      }

      reference.replaceWithText(typeArguments[0].getText());
      counts.readonlyUtility += 1;
      continue;
    }

    if (typeName === "ReadonlyArray") {
      reference.getTypeName().replaceWithText("Array");
      counts.readonlyArray += 1;
      continue;
    }

    if (typeName === "ReadonlyMap" || typeName === "ReadonlySet") {
      reference.getTypeName().replaceWithText(typeName === "ReadonlyMap" ? "Map" : "Set");
      counts[typeName === "ReadonlyMap" ? "readonlyMap" : "readonlySet"] += 1;
      continue;
    }

    if (typeName.startsWith("Readonly")) {
      throw new Error("Unclassified Readonly-prefixed type: " + reference.getText());
    }
  }

  for (const [kind, counter] of [
    [SyntaxKind.PropertySignature, "property"],
    [SyntaxKind.IndexSignature, "index"],
    [SyntaxKind.PropertyDeclaration, "classProperty"],
    [SyntaxKind.Parameter, "parameter"],
  ]) {
    const declarations = sourceFile
      .getDescendantsOfKind(kind)
      .filter((declaration) => declaration.hasModifier("readonly") && !isProtected(declaration))
      .sort((left, right) => right.getStart() - left.getStart());

    for (const declaration of declarations) {
      declaration.toggleModifier("readonly", false);
      counts[counter] += 1;
    }
  }

  const mappedTypes = sourceFile
    .getDescendantsOfKind(SyntaxKind.MappedType)
    .filter((mapped) => mapped.getReadonlyToken() !== undefined && !isProtected(mapped))
    .sort((left, right) => right.getStart() - left.getStart());

  for (const mapped of mappedTypes) {
    const original = mapped.getText();
    const replacement = original.replace(/^(\{\s*)(?:[+-]\s*)?readonly\s+/u, "$1");

    if (replacement === original) {
      throw new Error("Could not remove mapped readonly modifier: " + original);
    }

    mapped.replaceWithText(replacement);
    counts.mappedType += 1;
  }

  const operators = sourceFile
    .getDescendantsOfKind(SyntaxKind.TypeOperator)
    .filter(
      (operator) => operator.getOperator() === SyntaxKind.ReadonlyKeyword && !isProtected(operator),
    )
    .sort((left, right) => right.getStart() - left.getStart());

  for (const operator of operators) {
    operator.replaceWithText(operator.getTypeNode().getText());
    counts.typeOperator += 1;
  }
}

const remaining = [];

for (const sourceFile of project.getSourceFiles()) {
  for (const kind of [
    SyntaxKind.PropertySignature,
    SyntaxKind.IndexSignature,
    SyntaxKind.PropertyDeclaration,
    SyntaxKind.Parameter,
  ]) {
    for (const node of sourceFile.getDescendantsOfKind(kind)) {
      if (node.hasModifier("readonly") && !isProtected(node))
        remaining.push(sourceFile.getFilePath() + ":" + node.getText());
    }
  }

  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.TypeOperator)) {
    if (node.getOperator() === SyntaxKind.ReadonlyKeyword && !isProtected(node))
      remaining.push(sourceFile.getFilePath() + ":" + node.getText());
  }

  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.MappedType)) {
    if (node.getReadonlyToken() && !isProtected(node))
      remaining.push(sourceFile.getFilePath() + ":" + node.getText());
  }

  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    if (node.getTypeName().getText().startsWith("Readonly") && !isProtected(node))
      remaining.push(sourceFile.getFilePath() + ":" + node.getText());
  }
}

if (remaining.length > 0) throw new Error("Remaining forbidden syntax: " + remaining.join("\n"));

project.saveSync();

console.log(
  JSON.stringify(
    {
      sourceFiles: sourceFiles.length,
      counts,
      remaining: remaining.length,
    },
    null,
    2,
  ),
);
