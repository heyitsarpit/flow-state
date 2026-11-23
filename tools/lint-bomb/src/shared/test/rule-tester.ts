import { RuleTester } from "oxlint/plugins-dev";

export function createRuleTester(ruleName: string) {
  RuleTester.describe = (_name, callback) => callback();
  RuleTester.it = (name, callback) => {
    try {
      callback();
    } catch (error) {
      console.error(`failed: ${ruleName}: ${name}`);
      throw error;
    }
  };

  return new RuleTester({
    cwd: process.cwd(),
    languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } },
  });
}
