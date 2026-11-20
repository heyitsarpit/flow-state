type Palette = Readonly<{
  background: string;
  text: string;
  muted: string;
  comment: string;
  keyword: string;
  string: string;
  constant: string;
  func: string;
  type: string;
}>;

const theme = (name: string, type: "light" | "dark", p: Palette) => ({
  name,
  type,
  colors: { "editor.background": p.background, "editor.foreground": p.text },
  tokenColors: [
    { settings: { foreground: p.text, background: p.background } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: p.comment, fontStyle: "italic" } },
    {
      scope: ["punctuation", "meta.brace", "keyword.operator", "storage.type.function.arrow"],
      settings: { foreground: p.muted },
    },
    {
      scope: ["keyword", "storage", "storage.type", "storage.modifier", "keyword.control", "variable.language"],
      settings: { foreground: p.keyword },
    },
    {
      scope: ["string", "string.template", "punctuation.definition.string", "markup.inline.raw"],
      settings: { foreground: p.string },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"],
      settings: { foreground: p.constant },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function"],
      settings: { foreground: p.func },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
        "entity.other.inherited-class",
        "meta.type.annotation entity.name.type",
      ],
      settings: { foreground: p.type },
    },
    { scope: ["variable.other.property", "meta.object-literal.key", "support.variable.property"], settings: { foreground: p.text } },
    { scope: ["entity.name.tag", "support.type.property-name"], settings: { foreground: p.keyword } },
    { scope: ["markup.heading"], settings: { foreground: p.text, fontStyle: "bold" } },
    { scope: ["markup.deleted"], settings: { foreground: p.constant } },
    { scope: ["markup.inserted"], settings: { foreground: p.func } },
  ],
});

export const paper = theme("flow-paper", "light", {
  background: "#e9ebe3",
  text: "#27302b",
  muted: "#7b847d",
  comment: "#8c948b",
  keyword: "#33508f",
  string: "#86561c",
  constant: "#a4442c",
  func: "#1f5c47",
  type: "#5e4686",
});

export const chalk = theme("flow-chalk", "dark", {
  background: "#1b2420",
  text: "#e9e6da",
  muted: "#9aa396",
  comment: "#7f8d82",
  keyword: "#f0d27a",
  string: "#eaa98d",
  constant: "#a3d2e3",
  func: "#bde3a9",
  type: "#d7bbe6",
});
