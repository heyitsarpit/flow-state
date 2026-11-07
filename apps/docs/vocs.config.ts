import { defineConfig, type Config } from "vocs/config";
import { chalk, paper } from "./code-themes";

const config: Config = defineConfig({
  title: "Flow State",
  description: "Effect-native state machines for frontend applications.",
  codeHighlight: { themes: { light: paper, dark: chalk } },
  topNav: [
    { text: "Start", link: "/" },
    { text: "Guides", link: "/guide/ownership-and-runtime-facts" },
    { text: "Reference", link: "/reference/api" },
    { text: "Status", link: "/reference/status" },
  ],
  sidebar: [
    {
      text: "Start",
      items: [
        { text: "Overview", link: "/" },
        { text: "Supported Today", link: "/reference/status" },
        { text: "Getting Started", link: "/getting-started" },
        { text: "Concepts", link: "/concepts" },
      ],
    },
    {
      text: "Guides",
      items: [
        { text: "App Structure", link: "/guide/app-structure" },
        { text: "Ownership And Runtime Facts", link: "/guide/ownership-and-runtime-facts" },
        { text: "Server And Hydration", link: "/guide/server-hydration" },
        { text: "Recipes", link: "/guide/recipes" },
        { text: "Debugging", link: "/guide/debugging" },
        { text: "Patterns", link: "/guide/patterns" },
        { text: "Testing", link: "/guide/testing" },
      ],
    },
    {
      text: "Reference",
      items: [
        { text: "API", link: "/reference/api" },
        { text: "Testing", link: "/reference/testing" },
        { text: "Resources", link: "/reference/resources" },
        { text: "Transactions", link: "/reference/transactions" },
        { text: "Machines", link: "/reference/machines" },
        { text: "React And Views", link: "/reference/views-react" },
        { text: "Runtime", link: "/reference/runtime" },
        { text: "Streams And Time", link: "/reference/streams-time" },
        { text: "Inspection", link: "/reference/inspection" },
        { text: "Current Status", link: "/reference/status" },
        { text: "Migration", link: "/migration" },
      ],
    },
  ],
});

export default config;
