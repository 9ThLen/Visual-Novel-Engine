import { describe, expect, it, vi } from 'vitest';

import {
  getNativewindColorSchemeController,
  getNativewindRemapProps,
  getNativewindVarsFactory,
} from '@/lib/theme-nativewind';

describe('theme nativewind bindings', () => {
  it('does not load nativewind color scheme bindings on web', () => {
    const loadBindings = vi.fn();

    const controller = getNativewindColorSchemeController({
      isWeb: true,
      loadBindings,
    });

    expect(controller).toBeUndefined();
    expect(loadBindings).not.toHaveBeenCalled();
  });

  it('loads nativewind color scheme bindings on native', () => {
    const set = vi.fn();
    const loadBindings = vi.fn(() => ({
      colorScheme: { set },
    }));

    const controller = getNativewindColorSchemeController({
      isWeb: false,
      loadBindings,
    });

    expect(loadBindings).toHaveBeenCalledOnce();
    expect(controller?.set).toBe(set);
  });

  it('does not load nativewind vars bindings on web', () => {
    const loadBindings = vi.fn();

    const varsFactory = getNativewindVarsFactory({
      isWeb: true,
      loadBindings,
    });

    expect(varsFactory).toBeUndefined();
    expect(loadBindings).not.toHaveBeenCalled();
  });

  it('loads nativewind vars bindings on native', () => {
    const vars = vi.fn((tokens) => tokens);
    const loadBindings = vi.fn(() => ({ vars }));

    const varsFactory = getNativewindVarsFactory({
      isWeb: false,
      loadBindings,
    });

    expect(loadBindings).toHaveBeenCalledOnce();
    expect(varsFactory).toBe(vars);
  });

  it('does not load nativewind remap bindings on web', () => {
    const loadBindings = vi.fn();

    const remapProps = getNativewindRemapProps({
      isWeb: true,
      loadBindings,
    });

    expect(remapProps).toBeUndefined();
    expect(loadBindings).not.toHaveBeenCalled();
  });

  it('loads nativewind remap bindings on native', () => {
    const remapProps = vi.fn();
    const loadBindings = vi.fn(() => ({ remapProps }));

    const binding = getNativewindRemapProps({
      isWeb: false,
      loadBindings,
    });

    expect(loadBindings).toHaveBeenCalledOnce();
    expect(binding).toBe(remapProps);
  });
});
