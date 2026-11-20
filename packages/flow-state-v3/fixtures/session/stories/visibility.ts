import { Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import { acme, workspaceQuietSetup } from "../app.ts";
import { Org } from "../machines/org.ts";
import { IdentityFake } from "../server/layer.ts";

/**
 * The organisation, a singleton every session reads, is renamed at the default capture interval;
 * the page hides before the interval and the name is written at once; shown, a second rename waits
 * for the interval; the page hides twice in a row and the second hide writes nothing.
 */
export const workspaceHide = Story.app(workspaceQuietSetup, {
  id: "session/hide",
  fixtures: [IdentityFake],
})
  .ensure(acme)
  .advance(RuntimeDefaults.captureInterval)
  .checkpoint("opened")
  .send(acme, Org.E.Rename({ name: "Acme" }))
  .advance("4999 millis")
  .checkpoint("just before the interval")
  .hide()
  .checkpoint("hidden")
  .show()
  .send(acme, Org.E.Rename({ name: "Acme Inc" }))
  .checkpoint("shown")
  .advance(RuntimeDefaults.captureInterval)
  .checkpoint("interval")
  .hide()
  .hide()
  .checkpoint("hidden twice");
