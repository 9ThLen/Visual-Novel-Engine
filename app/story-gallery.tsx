import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { StoryGalleryCard } from '@/components/story-home/StoryGalleryCard';
import { ConfirmDialog } from '@/components/ui';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { spacing, typeScale } from '@/lib/design-tokens';
import { pickImageFromDevice } from '@/lib/pick-image';
import { isBackgroundRemovalSupported, removeImageBackground } from '@/lib/remove-background';
import { getStoryGalleryImageAssets } from '@/lib/story-image-library';
import { buildStoryGallery } from '@/lib/story-gallery';
import { showToast } from '@/lib/toast-store';
import { addAssetToLibrary } from '@/stores/media-library-actions';
import { selectSceneRecordsForStory, selectStoryMetadata, useAppStore } from '@/stores/use-app-store';

export default function StoryGalleryRoute() {
  const { storyId } = useLocalSearchParams<{ storyId: string }>();
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const story = useAppStore(useMemo(() => storyId ? selectStoryMetadata(storyId) : () => undefined, [storyId]));
  const scenes = useAppStore(useMemo(() => storyId ? selectSceneRecordsForStory(storyId) : () => [], [storyId]));
  const mediaLibrary = useAppStore((state) => state.mediaLibrary);
  const memberships = useAppStore((state) => state.imageAssetIdsByStory);
  const characters = useAppStore((state) => storyId ? state.characterLibraries[storyId] ?? [] : []);
  const hydrate = useAppStore((state) => state.hydrateSceneRecordsForStory);
  const addImage = useAppStore((state) => state.addImageAssetToStory);
  const removeImage = useAppStore((state) => state.removeImageAssetFromStory);
  const [imageToRemove, setImageToRemove] = useState<string | null>(null);
  const [removingBackgroundId, setRemovingBackgroundId] = useState<string | null>(null);
  useEffect(() => { if (storyId) void hydrate(storyId); }, [hydrate, storyId]);
  const images = useMemo(() => storyId ? getStoryGalleryImageAssets(storyId, memberships, mediaLibrary, scenes) : [], [memberships, mediaLibrary, scenes, storyId]);
  const gallery = useMemo(() => buildStoryGallery(images, characters, scenes), [characters, images, scenes]);
  const handleAdd = useCallback(async () => {
    if (!storyId) return;
    try { const picked = await pickImageFromDevice(); if (!picked) return; const asset = await addAssetToLibrary(picked.uri, picked.name, 'image'); addImage(storyId, asset.id); showToast(t('storyHome.imageAdded'), 'success'); }
    catch { showToast(t('storyHome.imageAddFailed'), 'error'); }
  }, [addImage, storyId, t]);
  const handleCutout = useCallback(async (asset: { id: string; name: string; uri: string }) => {
    if (!storyId || removingBackgroundId) return;
    setRemovingBackgroundId(asset.id);
    try { const uri = await removeImageBackground(asset.uri); const name = asset.name.replace(/\.(png|jpe?g|webp)$/i, ''); const created = await addAssetToLibrary(uri, `${name} (cutout).png`, 'image'); addImage(storyId, created.id); showToast(t('storyHome.backgroundRemoved'), 'success'); }
    catch { showToast(t('storyHome.backgroundRemoveFailed'), 'error'); }
    finally { setRemovingBackgroundId(null); }
  }, [addImage, removingBackgroundId, storyId, t]);
  const selected = gallery.backgrounds.find(({ asset }) => asset.id === imageToRemove);
  return <ScreenContainer><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><IconSymbol name="chevron.left" size={22} color={colors.foreground}/></Pressable><View><Text style={[styles.pageTitle,{color:colors.foreground}]}>{t('storyHome.gallery.title')}</Text>{story ? <Text style={{color:colors.muted}}>{story.title}</Text> : null}</View></View>
    <StoryGalleryCard colors={colors} images={images} characters={characters} scenes={scenes} removingBackgroundId={removingBackgroundId} canRemoveBackground={isBackgroundRemovalSupported()} onAddImage={handleAdd} onRemoveImage={setImageToRemove} onRemoveBackground={handleCutout} onOpenCharacter={() => { const sceneId = scenes[0]?.id; if (storyId && sceneId) router.push({ pathname:'/document-editor', params:{storyId,sceneId} }); }}/>
  </ScrollView><ConfirmDialog visible={Boolean(imageToRemove)} title={t('storyHome.removeImageTitle')} message={t('storyHome.removeImageMessage',{name:selected?.asset.name ?? '',usage:selected?.usage.enabled ?? 0})} confirmLabel={t('common.delete')} onConfirm={() => { if (storyId && imageToRemove) removeImage(storyId,imageToRemove); setImageToRemove(null); }} onCancel={() => setImageToRemove(null)}/></ScreenContainer>;
}
const styles=StyleSheet.create({content:{padding:spacing.lg,gap:spacing.lg},header:{flexDirection:'row',alignItems:'center',gap:spacing.md},back:{width:40,height:40,alignItems:'center',justifyContent:'center'},pageTitle:{...typeScale.pageTitle}});
