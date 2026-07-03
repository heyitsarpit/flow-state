import { batch } from "@tanstack/store";
import { Context, Effect, Layer } from "effect";

type NotificationCallback = () => void;
type NotificationSchedulerShape = {
  readonly batch: <Value>(callback: () => Value) => Value;
  readonly schedule: (callback: NotificationCallback) => () => void;
  readonly flush: Effect.Effect<void>;
};
export type NotificationSchedulerService = NotificationSchedulerShape;

function makeImmediateNotificationScheduler(): NotificationSchedulerShape {
  return {
    batch: <Value>(callback: () => Value): Value => {
      let result!: Value;
      batch(() => {
        result = callback();
      });
      return result;
    },
    schedule: (callback) => {
      callback();
      return () => undefined;
    },
    flush: Effect.void,
  };
}

export class NotificationScheduler extends Context.Service<
  NotificationScheduler,
  NotificationSchedulerShape
>()("flow-state/NotificationScheduler") {
  static readonly liveLayer = Layer.succeed(
    NotificationScheduler,
    NotificationScheduler.of(makeImmediateNotificationScheduler()),
  );

  static readonly testLayer = Layer.succeed(
    NotificationScheduler,
    NotificationScheduler.of(makeImmediateNotificationScheduler()),
  );
}
