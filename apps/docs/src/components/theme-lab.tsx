"use client";

import { useEffect, useState } from "react";

type Axis = {
  readonly key: "icons" | "grid";
  readonly options: ReadonlyArray<readonly [value: string, label: string]>;
};

const axes: ReadonlyArray<Axis> = [
  { key: "icons", options: [["lucide", "lucide"], ["square", "square"], ["pixel", "pixel"]] },
  { key: "grid", options: [["page", "page"], ["figures", "figures"], ["off", "off"]] },
];

type Choice = Readonly<Record<Axis["key"], string>>;

const initial: Choice = { icons: "pixel", grid: "page" };

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
};

export function ThemeLab() {
  const [choice, setChoice] = useState<Choice>(initial);

  useEffect(() => {
    const stored = { ...initial };
    for (const axis of axes) {
      const value = read(`fs-${axis.key}`);
      if (value !== null && axis.options.some(([option]) => option === value)) stored[axis.key] = value;
    }
    setChoice(stored);
  }, []);

  useEffect(() => {
    for (const axis of axes) {
      document.documentElement.setAttribute(`data-fs-${axis.key}`, choice[axis.key]);
      write(`fs-${axis.key}`, choice[axis.key]);
    }
  }, [choice]);

  return (
    <div className="fs-lab" aria-label="Theme lab">
      {axes.map((axis) => (
        <div key={axis.key}>
          <b>{axis.key}</b>
          {axis.options.map(([value, label]) => (
            <span key={value}>
              <button
                type="button"
                aria-pressed={choice[axis.key] === value}
                onClick={() => setChoice((current) => ({ ...current, [axis.key]: value }))}
              >
                {label}
              </button>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
