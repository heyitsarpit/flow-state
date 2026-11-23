import { Story } from "../../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../../src/index.ts";
import { homeReadingsSetup, loungeCard, Thermometer } from "../pending/thermometer.ts";
import { SensorsFake, SensorsFakeSteadfast } from "../server/layer.ts";
import { Sensors } from "../server/sensors.ts";

/**
 * The lounge's card reads 19 degrees; the room warms to 22 and the card's refresh a minute on
 * reads it.
 */
export const cardUsual = Story.app(homeReadingsSetup, {
  id: "home/card-usual",
  fixtures: [SensorsFake],
})
  .ensure(loungeCard)
  .checkpoint("shown")
  .world(Sensors.warm({ room: "lounge", celsius: 22 }))
  .advance("1 minute")
  .checkpoint("refreshed");

/**
 * Over a hub that never stops a reading, the card goes away while its reading is asked, so that
 * reading is told to stop and runs on; the card comes back on its own one disposal bound later, the
 * instant the stopped reading passes the disposal bound. The card shows one issue then, and none
 * once the reading ends.
 */
export const releaseMeetsSchedule = Story.app(homeReadingsSetup, {
  id: "home/release-meets-schedule",
  fixtures: [SensorsFakeSteadfast],
})
  .world(Sensors.reading.hold())
  .ensure(loungeCard)
  .send(loungeCard, Thermometer.E.Away())
  .checkpoint("away")
  .advance(RuntimeDefaults.disposalBound)
  .checkpoint("met")
  .world(Sensors.reading.release())
  .checkpoint("ended");
