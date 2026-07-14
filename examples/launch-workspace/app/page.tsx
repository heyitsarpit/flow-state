import { LaunchWorkspaceClient } from "./LaunchWorkspaceClient";
import { createLaunchWorkspaceRequestBoot } from "../src/launchWorkspaceServer";

export default async function Page() {
  const boot = await createLaunchWorkspaceRequestBoot();

  return <LaunchWorkspaceClient boot={boot} />;
}
