export type ControlledEffectState<Value, Error> =
  | Readonly<{ readonly status: "idle" }>
  | Readonly<{ readonly status: "success"; readonly value: Value }>
  | Readonly<{ readonly status: "failure"; readonly error: Error }>
  | Readonly<{ readonly status: "interrupt" }>;

export type ControlledEffect<Value, Error> = Readonly<{
  readonly kind: "controlledEffect";
  readonly id: string;
  readonly state: () => ControlledEffectState<Value, Error>;
  readonly succeed: (value: Value) => void;
  readonly fail: (error: Error) => void;
  readonly interrupt: () => void;
}>;

export function createControlledEffect<Value, Error = never>(
  id: string,
): ControlledEffect<Value, Error> {
  let current: ControlledEffectState<Value, Error> = { status: "idle" };

  return Object.freeze({
    kind: "controlledEffect",
    id,
    state: () => current,
    succeed: (value: Value) => {
      current = { status: "success", value };
    },
    fail: (error: Error) => {
      current = { status: "failure", error };
    },
    interrupt: () => {
      current = { status: "interrupt" };
    },
  });
}
