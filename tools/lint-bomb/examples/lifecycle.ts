// Code reference for ../STYLE.md, "No implicit state machines". Effect 4.0.5.
// A value whose allowed operations depend on what happened to it is a state machine: name it.
// Each phase carries only the facts valid in it: a url exists only once Done, a reason only once
// Failed. The implicit version, `{ sending: boolean; url?: string; error?: string }`, admits
// combinations no upload can be in, and every reader must rediscover which ones are real.
import { Data, Result } from "effect";

export type Upload = Data.TaggedEnum<{
  Queued: { file: string };
  Sending: { file: string };
  Done: { file: string; url: string };
  Failed: { file: string; reason: string };
}>;

export const Upload = Data.taggedEnum<Upload>();

export type UploadEvent = Data.TaggedEnum<{
  Begin: {};
  Succeed: { url: string };
  Fail: { reason: string };
  Retry: {};
}>;

export const UploadEvent = Data.taggedEnum<UploadEvent>();

export class UploadRefused extends Data.TaggedError("UploadRefused")<{
  phase: Upload["_tag"];
  event: UploadEvent["_tag"];
}> {}

// One pure transition matches phase and event exhaustively. An event a phase does not accept is
// an explicit refusal, so adding a phase or an event forces a decision for every pair.
// The state's owner (a Ref.modify or a driver) is the only caller.
export const advanceUpload = (upload: Upload, event: UploadEvent) => {
  const refuse = () => Result.fail(new UploadRefused({ phase: upload._tag, event: event._tag }));

  const move = (next: Upload) => Result.succeed(next);

  return Upload.$match(upload, {
    Queued: ({ file }) =>
      UploadEvent.$match(event, {
        Begin: () => move(Upload.Sending({ file })),
        Succeed: refuse,
        Fail: refuse,
        Retry: refuse,
      }),
    Sending: ({ file }) =>
      UploadEvent.$match(event, {
        Begin: refuse,
        Succeed: ({ url }) => move(Upload.Done({ file, url })),
        Fail: ({ reason }) => move(Upload.Failed({ file, reason })),
        Retry: refuse,
      }),
    Done: refuse,
    Failed: ({ file }) =>
      UploadEvent.$match(event, {
        Begin: refuse,
        Succeed: refuse,
        Fail: refuse,
        Retry: () => move(Upload.Sending({ file })),
      }),
  });
};
