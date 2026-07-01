/** @type {import("next").NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@flow-state/core",
    "@flow-state/inspect",
    "@flow-state/react",
    "@flow-state/server",
    "@flow-state/testing",
  ],
};

export default nextConfig;
