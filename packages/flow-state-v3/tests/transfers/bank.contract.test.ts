import { Layer } from "effect";
import { BankFake } from "../../fixtures/transfers/server/layer.ts";
import { Fake } from "../../src/host/testing/index.ts";
import { bankContract } from "./bank.contract.ts";

bankContract(
  "port fake over Fake.world, outside a Story (Stories R8)",
  BankFake.pipe(Layer.provide(Fake.world)),
);
