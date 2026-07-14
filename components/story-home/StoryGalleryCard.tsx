import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ResolvedAssetImage } from '@/components/resolved-asset-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/hooks/use-i18n';
import type { ThemeColorPalette } from '@/lib/_core/theme';
import { radius, spacing, typeScale } from '@/lib/design-tokens';
import type { Character } from '@/lib/character-types';
import type { SceneRecord } from '@/lib/engine/types';
import type { LibraryAsset } from '@/lib/media-library-service';
import { buildStoryGallery, type GalleryUsage } from '@/lib/story-gallery';

type Tab = 'all' | 'backgrounds' | 'sprites';
interface Props {
  colors: ThemeColorPalette; images: LibraryAsset[]; characters: Character[]; scenes: SceneRecord[];
  removingBackgroundId: string | null; canRemoveBackground: boolean;
  onAddImage: () => void; onRemoveImage: (id: string) => void;
  onRemoveBackground: (asset: LibraryAsset) => void; onOpenCharacter: (characterId: string) => void;
}

function Usage({ usage, colors }: { usage: GalleryUsage; colors: ThemeColorPalette }) {
  const { t } = useI18n();
  if (!usage.enabled && !usage.disabled) return null;
  return <Text style={[styles.usage, { color: colors.muted }]}>{t('storyHome.gallery.usage', { count: usage.enabled })}{usage.disabled ? ` ${t('storyHome.gallery.disabledUsage', { count: usage.disabled })}` : ''}</Text>;
}

export const StoryGalleryCard = React.memo(function StoryGalleryCard(props: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('all');
  const gallery = useMemo(() => buildStoryGallery(props.images, props.characters, props.scenes), [props.characters, props.images, props.scenes]);
  const showBackgrounds = tab !== 'sprites';
  const showSprites = tab !== 'backgrounds';
  const empty = tab === 'backgrounds' ? !gallery.backgrounds.length : tab === 'sprites'
    ? !gallery.characters.some((group) => group.sprites.length) : !gallery.backgrounds.length && !gallery.characters.some((group) => group.sprites.length);
  return <View style={[styles.card, { backgroundColor: props.colors['surface-1'], borderColor: props.colors.border }]}>
    <View style={styles.header}><Text style={[styles.title, { color: props.colors.foreground }]}>{t('storyHome.gallery.title')}</Text><Pressable onPress={props.onAddImage} style={styles.add}><IconSymbol name="add" size={16} color={props.colors.primary}/><Text style={{ color: props.colors.primary }}>{t('storyHome.addImage')}</Text></Pressable></View>
    <View style={[styles.tabs, { backgroundColor: props.colors.background }]}>{(['all', 'backgrounds', 'sprites'] as Tab[]).map((item) => <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && { backgroundColor: props.colors['surface-1'] }]}><Text style={{ color: tab === item ? props.colors.foreground : props.colors.muted }}>{t(`storyHome.gallery.tab.${item}`)}</Text></Pressable>)}</View>
    {empty ? <Text style={[styles.empty, { color: props.colors.muted }]}>{t(`storyHome.gallery.empty.${tab}`)}</Text> : null}
    {showBackgrounds && gallery.backgrounds.map(({ asset, usage }) => <View key={asset.id} style={[styles.item, { borderColor: props.colors.border, backgroundColor: props.colors.background }]}><ResolvedAssetImage uri={asset.uri} style={styles.image}/><View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: props.colors.foreground }]}>{asset.name}</Text><Usage usage={usage} colors={props.colors}/></View>{props.canRemoveBackground ? <Pressable onPress={() => props.onRemoveBackground(asset)} disabled={props.removingBackgroundId !== null} style={{ opacity: props.removingBackgroundId && props.removingBackgroundId !== asset.id ? .3 : 1 }}><IconSymbol name="scissors" size={17} color={props.colors.primary}/></Pressable> : null}<Pressable onPress={() => props.onRemoveImage(asset.id)}><IconSymbol name="delete" size={17} color={props.colors.danger}/></Pressable></View>)}
    {showSprites && gallery.characters.filter((group) => group.sprites.length).map(({ character, sprites }) => <View key={character.id} style={styles.group}><View style={styles.groupHeader}><View style={[styles.dot, { backgroundColor: character.color || props.colors.primary }]}/><Text style={[styles.name, { color: props.colors.foreground }]}>{character.name}</Text><Text style={{ color: props.colors.muted }}>{sprites.length}</Text></View>{sprites.map(({ sprite, usage }) => <View key={sprite.id} style={[styles.item, { borderColor: props.colors.border, backgroundColor: props.colors.background }]}><ResolvedAssetImage uri={sprite.uri} style={styles.image} resizeMode="contain"/><View style={styles.copy}><Text numberOfLines={1} style={[styles.name, { color: props.colors.foreground }]}>{sprite.name}</Text><Usage usage={usage} colors={props.colors}/></View><Pressable onPress={() => props.onOpenCharacter(character.id)}><Text style={{ color: props.colors.primary }}>{t('storyHome.gallery.openCharacter')}</Text></Pressable></View>)}</View>)}
  </View>;
});

const styles = StyleSheet.create({ card:{borderWidth:1,borderRadius:radius.lg,padding:spacing.lg,gap:spacing.md},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{...typeScale.sectionTitle},add:{flexDirection:'row',alignItems:'center',gap:spacing.xs},tabs:{flexDirection:'row',padding:3,borderRadius:radius.md},tab:{flex:1,alignItems:'center',paddingVertical:spacing.sm,borderRadius:radius.sm},empty:{...typeScale.body},item:{minHeight:64,flexDirection:'row',alignItems:'center',gap:spacing.sm,padding:spacing.sm,borderRadius:radius.md,borderWidth:1},image:{width:52,height:44,borderRadius:radius.sm},copy:{flex:1,minWidth:0},name:{...typeScale.label,fontWeight:'700'},usage:{...typeScale.caption},group:{gap:spacing.sm},groupHeader:{flexDirection:'row',alignItems:'center',gap:spacing.sm},dot:{width:10,height:10,borderRadius:radius.full} });
