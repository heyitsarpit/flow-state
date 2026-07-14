import { createPokemonRequestBoot } from "../src/server/request-boot";
import { HydratedPokemonClient } from "../src/ui/HydratedPokemonClient";

export default async function Page() {
  const boot = await createPokemonRequestBoot({ requestId: "next-request" });
  return <HydratedPokemonClient boot={boot} />;
}
