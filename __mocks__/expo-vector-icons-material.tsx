/**
 * `@expo/vector-icons/MaterialIcons.js` re-exports from an extensionless path
 * that this harness cannot resolve, which blocks every test rendering an icon.
 * The glyph itself is never what a test asserts on.
 */
import React from 'react';

export default function MaterialIcons(props: Record<string, unknown>) {
  return React.createElement('MaterialIcons', props);
}
