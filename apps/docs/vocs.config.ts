import { defineConfig, type Config } from "vocs/config";

const config: Config = defineConfig({
  title: "Flow State",
  description: "Effect-native state machines for frontend applications.",
  accentColor: "light-dark(#3155ff, #9fb2ff)",
  logoUrl: { light: "/logo-light.svg", dark: "/logo-dark.svg" },
  topNav: [
    { text: "Planning", link: "/planning/goals" },
    { text: "Examples", link: "/examples" },
    { text: "Reference", link: "/reference/lib_api" },
    { text: "Reference vNext", link: "/reference-next" },
  ],
  sidebar: [
    {
      text: "Start",
      items: [
        { text: "Overview", link: "/" },
        { text: "Examples", link: "/examples" },
      ],
    },
    {
      text: "Planning",
      items: [
        { text: "Goals", link: "/planning/goals" },
        { text: "State", link: "/planning/state" },
      ],
    },
    {
      text: "Reference",
      items: [
        { text: "Library API", link: "/reference/lib_api" },
        { text: "Runtime Semantics", link: "/reference/runtime_semantics" },
        { text: "Test API", link: "/reference/test_api" },
        { text: "Extra Features API", link: "/reference/extra_features_api" },
        { text: "Quality Gates", link: "/reference/quality-gates" },
      ],
    },
    {
      text: "Reference vNext",
      items: [
        { text: "Overview", link: "/reference-next" },
        { text: "Library API", link: "/reference-next/lib-api" },
        { text: "Core API", link: "/reference-next/core" },
        { text: "Effect Runtime", link: "/reference-next/effect-runtime" },
        { text: "Streams And Schedules", link: "/reference-next/streams-schedules" },
        { text: "Tests And Examples", link: "/reference-next/tests-and-examples" },
      ],
    },
  ],
});

export default config;
