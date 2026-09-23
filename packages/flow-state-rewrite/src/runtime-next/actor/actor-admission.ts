import type { MachineRecordValue } from "../../machine/machine.js";

/** A captured stable ref is identity data; public validation happens before directory admission. */
export type StableActorRef = Readonly<{
  machine: MachineRecordValue;
  id: string;
  persist: boolean;
}>;

/** Length-prefixing preserves tuple boundaries even when authored IDs contain separators. */
export const stableActorKey = (runtimeId: string, ref: StableActorRef) => {
  const segment = (value: string) => `${value.length}:${value}`;

  return `${runtimeId}/stable/${segment(ref.machine.definition.id)}/${segment(ref.id)}`;
};

/** A counter has one last valid allocation, then reports exhaustion before mutation. */
export const checkedAllocation = (next: number, exhausted: boolean) => {
  if (exhausted || !Number.isSafeInteger(next) || next < 1) return undefined;

  return {
    value: next,
    next: next === Number.MAX_SAFE_INTEGER ? next : next + 1,
    exhausted: next === Number.MAX_SAFE_INTEGER,
  };
};

export type AllocationCursor = { next: number; exhausted: boolean };

/** Local reservations commit both cursor successors or neither. */
export const checkedLocalAllocation = (
  incarnation: AllocationCursor,
  ordinal: AllocationCursor,
) => {
  const nextIncarnation = checkedAllocation(incarnation.next, incarnation.exhausted);
  const nextOrdinal = checkedAllocation(ordinal.next, ordinal.exhausted);

  return nextIncarnation === undefined || nextOrdinal === undefined
    ? undefined
    : { incarnation: nextIncarnation, ordinal: nextOrdinal };
};
