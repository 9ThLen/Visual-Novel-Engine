type VarsFactory = (tokens: Record<string, string>) => Record<string, string> | undefined;

export function createThemeVariables(options: {
  isWeb: boolean;
  palette: Record<string, string | undefined>;
  varsFactory?: VarsFactory;
}) {
  const { isWeb, palette, varsFactory } = options;

  if (isWeb) {
    return undefined;
  }

  if (!varsFactory) {
    throw new Error('varsFactory is required on native platforms');
  }

  const tokens = Object.fromEntries(
    Object.entries(palette)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([token, value]) => [`color-${token}`, value])
  );

  return varsFactory(tokens);
}
