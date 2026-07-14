import * as flow from "flow-state";

import type { ProjectCursor } from "../../domain/projects";
import { projectPageResource } from "./resources";

export type FeedState =
  | "minus-20"
  | "minus-16"
  | "minus-12"
  | "minus-8"
  | "minus-4"
  | "zero"
  | "plus-4"
  | "plus-8"
  | "plus-12"
  | "plus-16"
  | "plus-20"
  | "refreshing-zero";

export interface FeedContext {
  readonly frontier: ProjectCursor;
}

export type FeedEvent =
  | { readonly type: "NEXT" }
  | { readonly type: "PREVIOUS" }
  | { readonly type: "REFRESH" }
  | { readonly type: "REFRESH_DONE" }
  | { readonly type: "RETRY" };

const moveTo = (frontier: ProjectCursor) => () => ({ frontier });
const hasNext = ({ context }: { readonly context: FeedContext }) => context.frontier < 20;
const hasPrevious = ({ context }: { readonly context: FeedContext }) => context.frontier > -20;

export const feedMachine = flow.machine<FeedContext, FeedEvent, FeedState>({
  id: "feed.window",
  initial: "zero",
  context: () => ({ frontier: 0 }),
  states: {
    "minus-20": {
      invoke: [
        flow.ensure(projectPageResource.ref(-20)),
        flow.ensure(projectPageResource.ref(-16)),
        flow.ensure(projectPageResource.ref(-12)),
      ],
      on: {
        NEXT: { target: "minus-16", guard: hasNext, update: moveTo(-16) },
        PREVIOUS: { target: "minus-20", guard: hasPrevious },
        RETRY: { target: "minus-20", reenter: true },
      },
    },
    "minus-16": {
      invoke: [
        flow.ensure(projectPageResource.ref(-20)),
        flow.ensure(projectPageResource.ref(-16)),
        flow.ensure(projectPageResource.ref(-12)),
      ],
      on: {
        NEXT: { target: "minus-12", update: moveTo(-12) },
        PREVIOUS: { target: "minus-20", update: moveTo(-20) },
        RETRY: { target: "minus-16", reenter: true },
      },
    },
    "minus-12": {
      invoke: [
        flow.ensure(projectPageResource.ref(-20)),
        flow.ensure(projectPageResource.ref(-16)),
        flow.ensure(projectPageResource.ref(-12)),
      ],
      on: {
        NEXT: { target: "minus-8", update: moveTo(-8) },
        PREVIOUS: { target: "minus-16", update: moveTo(-16) },
        RETRY: { target: "minus-12", reenter: true },
      },
    },
    "minus-8": {
      invoke: [
        flow.ensure(projectPageResource.ref(-12)),
        flow.ensure(projectPageResource.ref(-8)),
        flow.ensure(projectPageResource.ref(-4)),
      ],
      on: {
        NEXT: { target: "minus-4", update: moveTo(-4) },
        PREVIOUS: { target: "minus-12", update: moveTo(-12) },
        RETRY: { target: "minus-8", reenter: true },
      },
    },
    "minus-4": {
      invoke: [
        flow.ensure(projectPageResource.ref(-8)),
        flow.ensure(projectPageResource.ref(-4)),
        flow.ensure(projectPageResource.ref(0)),
      ],
      on: {
        NEXT: { target: "zero", update: moveTo(0) },
        PREVIOUS: { target: "minus-8", update: moveTo(-8) },
        RETRY: { target: "minus-4", reenter: true },
      },
    },
    zero: {
      invoke: [flow.ensure(projectPageResource.ref(0))],
      on: {
        NEXT: { target: "plus-4", update: moveTo(4) },
        PREVIOUS: { target: "minus-4", update: moveTo(-4) },
        REFRESH: "refreshing-zero",
        RETRY: { target: "zero", reenter: true },
      },
    },
    "plus-4": {
      invoke: [flow.ensure(projectPageResource.ref(0)), flow.ensure(projectPageResource.ref(4))],
      on: {
        NEXT: { target: "plus-8", update: moveTo(8) },
        PREVIOUS: { target: "zero", update: moveTo(0) },
        RETRY: { target: "plus-4", reenter: true },
      },
    },
    "plus-8": {
      invoke: [
        flow.ensure(projectPageResource.ref(0)),
        flow.ensure(projectPageResource.ref(4)),
        flow.ensure(projectPageResource.ref(8)),
      ],
      on: {
        NEXT: { target: "plus-12", update: moveTo(12) },
        PREVIOUS: { target: "plus-4", update: moveTo(4) },
        RETRY: { target: "plus-8", reenter: true },
      },
    },
    "plus-12": {
      invoke: [
        flow.ensure(projectPageResource.ref(4)),
        flow.ensure(projectPageResource.ref(8)),
        flow.ensure(projectPageResource.ref(12)),
      ],
      on: {
        NEXT: { target: "plus-16", update: moveTo(16) },
        PREVIOUS: { target: "plus-8", update: moveTo(8) },
        RETRY: { target: "plus-12", reenter: true },
      },
    },
    "plus-16": {
      invoke: [
        flow.ensure(projectPageResource.ref(8)),
        flow.ensure(projectPageResource.ref(12)),
        flow.ensure(projectPageResource.ref(16)),
      ],
      on: {
        NEXT: { target: "plus-20", update: moveTo(20) },
        PREVIOUS: { target: "plus-12", update: moveTo(12) },
        RETRY: { target: "plus-16", reenter: true },
      },
    },
    "plus-20": {
      invoke: [
        flow.ensure(projectPageResource.ref(12)),
        flow.ensure(projectPageResource.ref(16)),
        flow.ensure(projectPageResource.ref(20)),
      ],
      on: {
        NEXT: { target: "plus-20", guard: hasNext },
        PREVIOUS: { target: "plus-16", update: moveTo(16) },
        RETRY: { target: "plus-20", reenter: true },
      },
    },
    "refreshing-zero": {
      invoke: [flow.refresh(projectPageResource.ref(0))],
      on: { REFRESH_DONE: "zero" },
    },
  },
});
