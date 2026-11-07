"use client";

import { useEffect } from "react";

const settleMs = 900;

export function ScrollActivity() {
  useEffect(() => {
    const timers = new Map<Element, number>();

    const onScroll = (event: Event) => {
      const target = event.target instanceof Element ? event.target : document.documentElement;
      target.setAttribute("data-fs-scrolling", "");
      window.clearTimeout(timers.get(target));
      timers.set(
        target,
        window.setTimeout(() => {
          target.removeAttribute("data-fs-scrolling");
          timers.delete(target);
        }, settleMs),
      );
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
}
