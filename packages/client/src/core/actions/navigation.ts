export const navigationActions = {
  navigate: async (params: unknown) => {
    const { path } = params as { path: string };
    window.location.href = path;
  },
};
