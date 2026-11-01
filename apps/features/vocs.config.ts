import { defineConfig, type Config } from "vocs/config";

// Areas in review order. Only areas with `link` have a page; the rest are placeholders.
const areas = [
  { text: "Definition", link: "/definition" },
  { text: "Machine", link: "/machine" },
  { text: "Fragments", link: "/fragments" },
  { text: "Collections", link: "/collections" },
  { text: "Schedules", link: "/schedules" },
  { text: "Operations", link: "/operations" },
  { text: "Entities", link: "/entities" },
  { text: "Streams", link: "/streams" },
  { text: "Stories", link: "/stories" },
  { text: "Views and React", link: "/views" },
  { text: "Runtime", link: "/runtime" },
  { text: "Persistence", link: "/persistence" },
  { text: "Inspection and tooling", link: "/inspection" },
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
