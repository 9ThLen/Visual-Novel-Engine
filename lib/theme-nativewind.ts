type NativewindBindings = {
  colorScheme?: {
    set: (scheme: 'light' | 'dark') => void;
  };
  remapProps?: <T>(component: T, mapping: Record<string, boolean | string>) => void;
  vars?: (tokens: Record<string, string>) => Record<string, string> | undefined;
};

type LoadBindings = () => NativewindBindings;

function defaultLoadBindings(): NativewindBindings {
  return require('nativewind') as NativewindBindings;
}

export function getNativewindColorSchemeController(options: {
  isWeb: boolean;
  loadBindings?: LoadBindings;
}) {
  const { isWeb, loadBindings = defaultLoadBindings } = options;

  if (isWeb) {
    return undefined;
  }

  return loadBindings().colorScheme;
}

export function getNativewindVarsFactory(options: {
  isWeb: boolean;
  loadBindings?: LoadBindings;
}) {
  const { isWeb, loadBindings = defaultLoadBindings } = options;

  if (isWeb) {
    return undefined;
  }

  return loadBindings().vars;
}

export function getNativewindRemapProps(options: {
  isWeb: boolean;
  loadBindings?: LoadBindings;
}) {
  const { isWeb, loadBindings = defaultLoadBindings } = options;

  if (isWeb) {
    return undefined;
  }

  return loadBindings().remapProps;
}
