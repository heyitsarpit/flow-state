import { test } from "vite-plus/test";
import {
  cancelled,
  fileGone,
  gaveUp,
  lostThenResent,
  removedUploadingThenReload,
  removedWhileUploading,
  tooLarge,
  uploaded,
} from "./upload.story.js";

test("upload shows a full bar while waiting, then stores", () => uploaded.run());

test("cancel interrupts the upload and releases the hold", () => cancelled.run());

test("a lost answer re-sends the same Attempt and stores once", () => lostThenResent.run());

test("three re-sends, then it gives up", () => gaveUp.run());

test("a file over the limit fails without a retry", () => tooLarge.run());

test("a draft whose bytes are gone ends FileGone and sends nothing", () => fileGone.run());

test("removing an uploading copy releases its lane", () => removedWhileUploading.run());

test("removed while uploading, then reload: nothing parked", () =>
  removedUploadingThenReload.run());
