"use client";

import { useEffect, useState } from "react";

type Axis = {
  readonly key: "grid";
  readonly options: ReadonlyArray<readonly [value: string, label: string]>;
};

const axes: ReadonlyArray<Axis> = [
  { key: "grid", options: [["page", "page"], ["figures", "figures"], ["off", "off"]] },
];

type Choice = Readonly<Record<Axis["key"], string>>;

const initial: Choice = { grid: "page" };

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
  const [loaded, setLoaded] = useState<Choice | null>(null);
  const choice = loaded ?? initial;

  useEffect(() => {
    const stored: Record<Axis["key"], string> = { ...initial };
    for (const axis of axes) {
      const value = read(`fs-${axis.key}`);
      if (value !== null && axis.options.some(([option]) => option === value)) stored[axis.key] = value;
    }
    setLoaded(stored);
  }, []);

  useEffect(() => {
    if (loaded === null) return;
    for (const axis of axes) {
      document.documentElement.setAttribute(`data-fs-${axis.key}`, loaded[axis.key]);
      write(`fs-${axis.key}`, loaded[axis.key]);
    }
  }, [loaded]);

  const pick = (key: Axis["key"], value: string) =>
    setLoaded((current) => ({ ...(current ?? initial), [key]: value }));

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
                onClick={() => pick(axis.key, value)}
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
