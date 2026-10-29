import { defineConfig, type Config } from "vocs/config";

// Areas in review order. Only areas with `link` have a page; the rest are placeholders.
const areas = [
  { text: "Definition", link: "/definition" },
  { text: "Machine", link: "/machine" },
  { text: "Fragments" },
  { text: "Collections" },
  { text: "Schedules" },
  { text: "Server calls" },
  { text: "Stories" },
  { text: "Views and React" },
  { text: "Runtime" },
  { text: "Persistence" },
  { text: "Inspection and tooling" },
].map((area) => (area.link ? area : { text: `${area.text} (later)`, disabled: true }));

const config: Config = defineConfig({
  title: "Flow State features",
  description: "Internal feature inventory for the Flow State design. Prototype.",
  accentColor: "light-dark(#3155ff, #9fb2ff)",
  sidebar: [
    { text: "Start", link: "/" },
    { text: "Areas", items: areas },
  ],
});

export default config;
