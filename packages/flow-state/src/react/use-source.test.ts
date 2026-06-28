import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { useSource } from "./use-source.js";

describe("useSource", () => {
  it("uses getServerSnapshot during server rendering when available", () => {
    const Reader = (): React.ReactElement => {
      const value = useSource({
        getSnapshot: () => "client",
        getServerSnapshot: () => "server",
        subscribe: () => () => undefined,
      });

      return createElement("span", null, value);
    };

    expect(renderToStaticMarkup(createElement(Reader))).toBe("<span>server</span>");
  });

  it("falls back to getSnapshot during server rendering when no server snapshot exists", () => {
    const Reader = (): React.ReactElement => {
      const value = useSource({
        getSnapshot: () => "client",
        subscribe: () => () => undefined,
      });

      return createElement("span", null, value);
    };

    expect(renderToStaticMarkup(createElement(Reader))).toBe("<span>client</span>");
  });
});
