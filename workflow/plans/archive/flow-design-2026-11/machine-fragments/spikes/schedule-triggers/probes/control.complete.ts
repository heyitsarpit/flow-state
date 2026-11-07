declare function f(x: { arm: readonly ("cooldown" | "settle")[] }): void;
f({ arm: ["/*|*/"] });
