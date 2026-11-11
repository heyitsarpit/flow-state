# Vendored ESLint Stylistic code

`padding-line-between-statements.ts`, `padding-line-options.d.ts`, and `padding-line-ast.ts` are
adapted from [ESLint Stylistic](https://github.com/eslint-stylistic/eslint-stylistic), commit
`435c3ea0fd26a5fef9042c4b36b6e165fbbf8d08`. The upstream MIT license is retained in
[LICENSE](LICENSE).

In the source repository, the local rule policy and focused tests are:

- `src/rules/typescript/require-readable-spacing.ts`
- `src/rules/typescript/require-readable-spacing.test.ts`
- `src/rules/typescript/require-readable-spacing-cli.test.ts`

Run `nub run check` from the repository root to verify the rule and packaged consumer.
