import { defineConfig } from "vocs/config";

export default defineConfig({
  title: "Flow State",
  description: "Effect-native state machines for frontend applications.",
  accentColor: "light-dark(#3155ff, #9fb2ff)",
  logoUrl: { light: "/logo-light.svg", dark: "/logo-dark.svg" },
  topNav: [
    { text: "Planning", link: "/planning/goals" },
    { text: "Reference", link: "/reference/library" },
  ],
  sidebar: [
    {
      text: "Start",
      items: [
        { text: "Overview", link: "/" },
        { text: "Docs Framework", link: "/reference/docs-framework" },
      ],
    },
    {
      text: "Planning",
      items: [
        { text: "Goals", link: "/planning/goals" },
        { text: "State", link: "/planning/state" },
        { text: "Plan 00", link: "/planning/plans-00" },
        { text: "Plan 01", link: "/planning/plans-01" },
        { text: "Plan 02", link: "/planning/plans-02" },
        { text: "Plan 03", link: "/planning/plans-03" },
      ],
    },
    {
      text: "Reference",
      items: [{ text: "Library Reference", link: "/reference/library" }],
    },
  ],
});
