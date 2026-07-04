export const Asset = {
  fromModule: (module: unknown) => ({
    localUri: `mock://asset/${String(module)}`,
    uri: `mock://asset/${String(module)}`,
    downloadAsync: async () => {},
  }),
};
export const useAssets = () => [[], {}];
export default {};
