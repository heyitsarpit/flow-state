import { LaunchWorkspaceApp, launchWorkspaceStories } from "../launchWorkspaceAssembly";

type BehaviorGatewayContract = Readonly<{
  readonly app: typeof LaunchWorkspaceApp;
  readonly stories: readonly [typeof launchWorkspaceStories];
}>;

export const BehaviorGateway: BehaviorGatewayContract = {
  app: LaunchWorkspaceApp,
  stories: [launchWorkspaceStories],
};
