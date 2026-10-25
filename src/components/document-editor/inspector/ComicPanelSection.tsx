/**
 * The Inspector's "Panel" section (docs/plans/COMIC-STAGE-3-PLAN.md, 3.3): the
 * author's edits of the panel the Preview shows — the one under the caret, or
 * the one clicked in the Preview. A panel's shot, focus and size; each line's
 * kind of words and the side of its tail; an Undo of the last edit, and the
 * automatic panel back.
 *
 * It shows the edits as they act and reports what the author picks; the
 * inspector writes them (comic-settings.ts) to the scene record.
 */
import React from 'react';
import { Image, Pressable, Text, View, type GestureResponderEvent } from 'react-native';

import { useResolvedAssetUris } from '@/components/document-editor/inspector/useResolvedAssetUris';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { withAlpha } from '@/lib/_core/theme';
import { resolveCharacterSpriteUri } from '@/lib/character-resolver';
import type { Character } from '@/lib/character-types';
import type { ComicPanel, ComicPanelElement } from '@/lib/comic/comic-layout';
import {
  actingElementEdit,
  actingPanelEdit,
  type ComicElementChange,
  type ComicPanelChange,
  type ResolvedComicEdits,
} from '@/lib/comic/comic-settings';
import type { ComicPanelSize, ComicShot, ComicTailSide, ComicWordsStyle } from '@/lib/engine/types';

type Colors = ReturnType<typeof useColors>;

const SHOTS: readonly ComicShot[] = ['wide', 'full', 'medium', 'close', 'dramatic'];
const SIZES: readonly Exclude<ComicPanelSize, 'auto'>[] = ['full', 'half'];
const STYLES: readonly ComicWordsStyle[] = ['speech', 'shout', 'whisper', 'thought', 'caption'];
const TAILS: readonly Exclude<ComicTailSide, 'auto'>[] = ['left', 'right'];

const SHOT_KEYS: Record<ComicShot, string> = {
  wide: 'document.comicPanel.shotWide',
  full: 'document.comicPanel.shotFull',
  medium: 'document.comicPanel.shotMedium',
  close: 'document.comicPanel.shotClose',
  dramatic: 'document.comicPanel.shotDramatic',
};
const SIZE_KEYS: Record<Exclude<ComicPanelSize, 'auto'>, string> = {
  full: 'document.comicPanel.sizeFull',
  half: 'document.comicPanel.sizeHalf',
};
const STYLE_KEYS: Record<ComicWordsStyle, string> = {
  speech: 'document.comicPanel.styleSpeech',
  shout: 'document.comicPanel.styleShout',
  whisper: 'document.comicPanel.styleWhisper',
  thought: 'document.comicPanel.styleThought',
  caption: 'document.comicPanel.styleCaption',
};
const TAIL_KEYS: Record<Exclude<ComicTailSide, 'auto'>, string> = {
  left: 'document.comicPanel.tailLeft',
  right: 'document.comicPanel.tailRight',
};

/** The scene's picture in the section: the stage's shape, small enough to sit beside its buttons. */
const PICTURE_WIDTH = 176;
const PICTURE_HEIGHT = 110;

interface ComicPanelSectionProps {
  colors: Colors;
  storyId: string;
  characters: Character[];
  panel: ComicPanel;
  /** The panel's place in the plan, from 0. */
  index: number;
  total: number;
  /** The scene's edits as they act now. */
  edits: ResolvedComicEdits;
  onChangePanel: (change: ComicPanelChange) => void;
  onChangeElement: (element: ComicPanelElement, change: ComicElementChange) => void;
  /** Takes the panel's own edits away; left out when it has none. */
  onRestore?: () => void;
  /** Puts back the scene's edits as they were before the last change made here; left out when there is none. */
  onUndo?: () => void;
}

export function ComicPanelSection({
  colors,
  storyId,
  characters,
  panel,
  index,
  total,
  edits,
  onChangePanel,
  onChangeElement,
  onRestore,
  onUndo,
}: ComicPanelSectionProps) {
  const { t } = useI18n();
  const sentences = panel.elements.flatMap((element) => element.sentences);
  const acting = actingPanelEdit(edits, sentences);

  return (
    <View testID="comic-panel-section" style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ flex: 1, color: colors.foreground, fontSize: 15, fontWeight: '800' }}>
          {t('document.comicPanel.title', { index: index + 1, total })}
        </Text>
        <SmallButton colors={colors} label={`↶ ${t('document.comicPanel.undo')}`} onPress={onUndo} testID="comic-panel-undo" />
      </View>
      <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 15, marginTop: -6 }}>
        {t('document.comicPanel.hint')}
      </Text>

      <Field colors={colors} label={t('document.comicPanel.shot')}>
        <Chips
          colors={colors}
          testID="comic-shot"
          value={acting?.shot ?? 'auto'}
          options={[
            { value: 'auto', label: t('document.comicPanel.auto') },
            ...SHOTS.map((shot) => ({ value: shot, label: t(SHOT_KEYS[shot]) })),
          ]}
          onSelect={(shot) => onChangePanel({ shot: shot === 'auto' ? null : shot })}
        />
      </Field>

      <Field colors={colors} label={t('document.comicPanel.focus')}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <FocusPicture
            colors={colors}
            storyId={storyId}
            characters={characters}
            panel={panel}
            authored={Boolean(acting?.focus)}
            onPick={(focus) => onChangePanel({ focus })}
            label={t('document.comicPanel.focusPicture')}
          />
          <View style={{ flex: 1, gap: 7 }}>
            <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 15 }}>{t('document.comicPanel.focusHint')}</Text>
            <SmallButton
              colors={colors}
              label={t('document.comicPanel.auto')}
              onPress={acting?.focus ? () => onChangePanel({ focus: null }) : undefined}
              testID="comic-focus-auto"
            />
          </View>
        </View>
      </Field>

      <Field colors={colors} label={t('document.comicPanel.size')}>
        <Chips
          colors={colors}
          testID="comic-size"
          value={acting?.size ?? 'auto'}
          options={[
            { value: 'auto', label: t('document.comicPanel.auto') },
            ...SIZES.map((size) => ({ value: size, label: t(SIZE_KEYS[size]) })),
          ]}
          onSelect={(size) => onChangePanel({ size: size === 'auto' ? null : size })}
        />
      </Field>

      {panel.elements.map((element) => (
        <ElementEdits key={element.id} colors={colors} element={element} edits={edits} onChange={(change) => onChangeElement(element, change)} />
      ))}

      <SmallButton
        colors={colors}
        label={t('document.comicPanel.restore')}
        onPress={onRestore}
        testID="comic-panel-restore"
      />
    </View>
  );
}

/** A line of the panel: its kind of words, and the side of its tail unless it is a caption box. */
function ElementEdits({
  colors,
  element,
  edits,
  onChange,
}: {
  colors: Colors;
  element: ComicPanelElement;
  edits: ResolvedComicEdits;
  onChange: (change: ComicElementChange) => void;
}) {
  const { t } = useI18n();
  const own: ComicWordsStyle = element.kind === 'bubble' ? 'speech' : 'caption';
  const acting = actingElementEdit(edits, element.sentences);
  const style = acting?.style ?? own;
  const who = element.kind === 'bubble' ? element.speakerName || element.characterId : t('document.comicPanel.narration');

  return (
    <View
      testID={`comic-words-${element.anchor}`}
      style={{ gap: 8, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background }}
    >
      <Text numberOfLines={2} style={{ color: colors.foreground, fontSize: 12, lineHeight: 16 }}>
        <Text style={{ fontWeight: '800' }}>{`${who}: `}</Text>
        {element.text}
      </Text>
      <Field colors={colors} label={t('document.comicPanel.kind')}>
        <Chips
          colors={colors}
          testID={`comic-style-${element.anchor}`}
          value={style}
          options={STYLES.map((item) => ({ value: item, label: t(STYLE_KEYS[item]) }))}
          // The kind's own way is no edit at all.
          onSelect={(item) => onChange({ style: item === own ? null : item })}
        />
      </Field>
      {style !== 'caption' ? (
        <Field colors={colors} label={t('document.comicPanel.tail')}>
          <Chips
            colors={colors}
            testID={`comic-tail-${element.anchor}`}
            value={acting?.tail ?? 'auto'}
            options={[
              { value: 'auto', label: t('document.comicPanel.auto') },
              ...TAILS.map((tail) => ({ value: tail, label: t(TAIL_KEYS[tail]) })),
            ]}
            onSelect={(tail) => onChange({ tail: tail === 'auto' ? null : tail })}
          />
        </Field>
      ) : null}
    </View>
  );
}

/**
 * The scene's picture with what the panel shows of it outlined, and the point
 * it is about. A click there makes that point the panel's focus: it goes in
 * the middle of the panel, as close as the shot allows.
 */
function FocusPicture({
  colors,
  storyId,
  characters,
  panel,
  authored,
  onPick,
  label,
}: {
  colors: Colors;
  storyId: string;
  characters: Character[];
  panel: ComicPanel;
  authored: boolean;
  onPick: (focus: { x: number; y: number }) => void;
  label: string;
}) {
  const { picture, framing } = panel;
  const sprites = picture.characters.map((character) => ({
    character,
    ref: resolveCharacterSpriteUri(character.characterId, character.spriteId, { [storyId]: characters }, storyId) ?? null,
  }));
  const sources = useResolvedAssetUris([picture.backgroundAssetId, ...sprites.map((sprite) => sprite.ref)]);
  const background = picture.backgroundAssetId ? sources[picture.backgroundAssetId] : null;

  // What the frame shows of the stage: scaled by the zoom, the focus moved to
  // its place, never so far that the stage stops covering the panel.
  const zoom = Math.max(1, framing.zoom);
  const shift = (place: number, focus: number) => Math.max(1 - zoom, Math.min(0, place - focus * zoom));
  const shown = {
    left: -shift(framing.placement.x, framing.subject.x) / zoom,
    top: -shift(framing.placement.y, framing.subject.y) / zoom,
    size: 1 / zoom,
  };

  const pick = (event: GestureResponderEvent) => {
    const native = event.nativeEvent as unknown as { locationX?: number; locationY?: number; clientX?: number; clientY?: number };
    const x = typeof native.locationX === 'number' ? native.locationX : native.clientX;
    const y = typeof native.locationY === 'number' ? native.locationY : native.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
    onPick({ x: round(x / PICTURE_WIDTH), y: round(y / PICTURE_HEIGHT) });
  };

  return (
    <Pressable
      onPress={pick}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="comic-focus-picture"
      style={{
        width: PICTURE_WIDTH,
        height: PICTURE_HEIGHT,
        overflow: 'hidden',
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: '#2a2a30',
      }}
    >
      {/* Nothing in it takes the click: where it lands is read off the picture itself. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: PICTURE_WIDTH, height: PICTURE_HEIGHT }}>
        {background ? (
          <Image source={background} resizeMode="cover" style={{ position: 'absolute', left: 0, top: 0, width: PICTURE_WIDTH, height: PICTURE_HEIGHT }} />
        ) : null}
        {sprites.map(({ character, ref }) => {
          const source = ref ? sources[ref] : null;
          if (!source) return null;
          const width = PICTURE_HEIGHT * 0.5;
          return (
            <Image
              key={character.characterId}
              source={source}
              resizeMode="contain"
              style={{ position: 'absolute', bottom: 0, height: PICTURE_HEIGHT * 0.8, width, left: character.x * PICTURE_WIDTH - width / 2 }}
            />
          );
        })}
        <View
          testID="comic-focus-shown"
          style={{
            position: 'absolute',
            left: shown.left * PICTURE_WIDTH,
            top: shown.top * PICTURE_HEIGHT,
            width: shown.size * PICTURE_WIDTH,
            height: shown.size * PICTURE_HEIGHT,
            borderWidth: 2,
            borderColor: colors.primary,
          }}
        />
        <View
          testID="comic-focus-point"
          style={{
            position: 'absolute',
            left: framing.subject.x * PICTURE_WIDTH - 6,
            top: framing.subject.y * PICTURE_HEIGHT - 6,
            width: 12,
            height: 12,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: '#ffffff',
            backgroundColor: authored ? colors.primary : 'transparent',
          }}
        />
      </View>
    </Pressable>
  );
}

function Field({ colors, label, children }: { colors: Colors; label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Text>
      {children}
    </View>
  );
}

function Chips<T extends string>({
  colors,
  testID,
  value,
  options,
  onSelect,
}: {
  colors: Colors;
  testID: string;
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) onSelect(option.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            testID={`${testID}-${option.value}${active ? '-on' : ''}`}
            style={{
              minHeight: 26,
              paddingHorizontal: 9,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.border,
              backgroundColor: active ? withAlpha(colors.primary, 0.14) : colors.background,
            }}
          >
            <Text style={{ color: active ? colors.primary : colors.foreground, fontSize: 11, fontWeight: '700' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SmallButton({ colors, label, onPress, testID }: { colors: Colors; label: string; onPress?: () => void; testID: string }) {
  const disabled = !onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        minHeight: 28,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}
