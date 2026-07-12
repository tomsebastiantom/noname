import { init, registerShared } from "@module-federation/runtime";

let initialized = false;

export function initMfRuntime(): void {
  if (initialized) return;
  initialized = true;

  init({
    name: "noname-host",
    remotes: [],
  });

  registerShared({
    react: {
      version: "19.2.7",
      shareConfig: {
        singleton: true,
        requiredVersion: "^19.0.0",
        eager: true,
      },
      get: async () => {
        const mod = await import("react");
        return () => mod;
      },
    },
    "react-dom": {
      version: "19.2.7",
      shareConfig: {
        singleton: true,
        requiredVersion: "^19.0.0",
        eager: true,
      },
      get: async () => {
        const mod = await import("react-dom");
        return () => mod;
      },
    },
    "@json-render/core": {
      version: "0.19.0",
      shareConfig: {
        singleton: true,
        requiredVersion: "^0.19.0",
        eager: true,
      },
      get: async () => {
        const mod = await import("@json-render/core");
        return () => mod;
      },
    },
    "@json-render/react": {
      version: "0.19.0",
      shareConfig: {
        singleton: true,
        requiredVersion: "^0.19.0",
        eager: true,
      },
      get: async () => {
        const mod = await import("@json-render/react");
        return () => mod;
      },
    },
  });
}
