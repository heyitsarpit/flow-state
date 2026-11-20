// @vitest-environment happy-dom
import { Context } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Host } from "../host.ts";
import { browserPlatform } from "./browser.ts";

const showAs = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("the page's visibility on the browser platform (WriteAhead R10, I12)", () => {
  it.fails("WriteAhead R10: a visibilitychange to hidden reads hidden and calls the hidden listener at once", () => {
    const host = Context.get(browserPlatform(), Host);
    const heard: Array<string> = [];
    const stop = host.onHidden(() => void heard.push("hidden"));

    showAs("hidden");

    expect(host.hidden()).toBe(true);
    expect(heard).toEqual(["hidden"]);
    stop();
  });

  it.fails("WriteAhead R10: a pagehide calls the hidden listener at once", () => {
    const host = Context.get(browserPlatform(), Host);
    const heard: Array<string> = [];
    const stop = host.onHidden(() => void heard.push("hidden"));

    window.dispatchEvent(new Event("pagehide"));
    stop();

    expect(heard).toEqual(["hidden"]);
  });

  it("WriteAhead R10: a hidden listener stopped before the page hides hears nothing (a guard for the listening platform)", () => {
    const host = Context.get(browserPlatform(), Host);
    const heard: Array<string> = [];
    host.onHidden(() => void heard.push("hidden"))();

    showAs("hidden");
    showAs("visible");

    expect(heard).toEqual([]);
  });
});
