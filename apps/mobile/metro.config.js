const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    const mobileReactModule = require.resolve(moduleName, { paths: [projectRoot] });
    return context.resolveRequest(context, mobileReactModule, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
