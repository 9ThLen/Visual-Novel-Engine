// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "book.fill": "menu-book",
  home: "home",
  editor: "edit",
  settings: "settings",
  document: "article",
  manuscript: "auto-stories",
  timeline: "account-tree",
  blocks: "extension",
  preview: "visibility",
  save: "save",
  load: "folder-open",
  delete: "delete",
  duplicate: "content-copy",
  close: "close",
  menu: "menu",
  search: "search",
  image: "image",
  gallery: "photo-library",
  files: "folder",
  character: "person",
  sprites: "theater-comedy",
  music: "music-note",
  sound: "volume-up",
  voice: "record-voice-over",
  palette: "palette",
  play: "play-arrow",
  stop: "stop",
  location: "place",
  lightning: "bolt",
  add: "add",
  undo: "undo",
  redo: "redo",
  collapse: "keyboard-arrow-up",
  expand: "keyboard-arrow-down",
  movie: "movie",
  mic: "mic",
} satisfies Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
