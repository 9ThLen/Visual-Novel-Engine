/**
 * DocumentBranchBreadcrumb renders the chain of choices that lead to the
 * scene the author is currently viewing, marketplace-breadcrumb style:
 *
 *   Початок / Піти до міста / Зайти в таверну / Поточна сцена
 *
 * Choice words carry the same accent color as their option card in the
 * editor. Tapping a choice word opens a panel with the sibling options of
 * that choice block, so the author can switch branches without scrolling
 * back to the choice scene.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useColors } from '@/hooks/use-colors';
import { useI18n } from '@/hooks/use-i18n';
import { branchColorForOptionIndex } from '@/lib/document-editor/branch-colors';
import type { BranchBreadcrumbItem } from '@/lib/document-editor/branch-breadcrumb';
import type { ColorScheme } from '@/constants/theme';
import type { VNPlateBranchInfo } from '@/lib/vn-plate-editor/types';

interface DocumentBranchBreadcrumbProps {
  colorScheme?: ColorScheme;
  isPhone: boolean;
  /** Crumbs for the choices leading into the active scene, in path order. */
  crumbs: BranchBreadcrumbItem[];
  /** Name of the active scene — the trailing neutral crumb. */
  currentLabel: string;
  /** Branch info per choice block, for the switch panel options. */
  branchInfo?: VNPlateBranchInfo[];
  /** Existing branch: switch the active path to this option. */
  onSelectChoiceOption?: (choiceStepId: string, optionId: string) => void;
  /** Empty branch: create a scene for this option, then switch to it. */
  onStartBranchOption?: (choiceStepId: string, optionId: string) => void;
  /** Tap on «Початок» / a crumb word context — scroll the document to a scene. */
  onNavigateToScene?: (sceneId: string) => void;
  /** First scene of the story, target of the «Початок» crumb. */
  startSceneId?: string;
}

function Separator({ color }: { color: string }) {
  return (
    <Text style={{ color, fontSize: 13, paddingHorizontal: 7 }} accessibilityElementsHidden>
      /
    </Text>
  );
}

export function DocumentBranchBreadcrumb({
  colorScheme,
  isPhone,
  crumbs,
  currentLabel,
  branchInfo,
  onSelectChoiceOption,
  onStartBranchOption,
  onNavigateToScene,
  startSceneId,
}: DocumentBranchBreadcrumbProps) {
  const colors = useColors(colorScheme);
  const { t } = useI18n();
  const [openChoiceStepId, setOpenChoiceStepId] = useState<string | null>(null);

  const branchInfoByChoiceStepId = useMemo(() => {
    const map: Record<string, VNPlateBranchInfo> = {};
    for (const info of branchInfo ?? []) map[info.choiceStepId] = info;
    return map;
  }, [branchInfo]);

  // The open choice may leave the breadcrumb after a branch switch upstream
  // (the path below it changed) — close the panel instead of showing options
  // for a crumb that is no longer visible.
  useEffect(() => {
    if (!openChoiceStepId) return;
    if (!crumbs.some((crumb) => crumb.choiceStepId === openChoiceStepId)) {
      setOpenChoiceStepId(null);
    }
  }, [crumbs, openChoiceStepId]);

  const openInfo = openChoiceStepId ? branchInfoByChoiceStepId[openChoiceStepId] : undefined;

  const crumbLabel = useCallback(
    (crumb: BranchBreadcrumbItem) =>
      crumb.label.trim() || t('document.breadcrumb.option', { number: crumb.optionIndex + 1 }),
    [t],
  );

  // Single tap toggles the options panel; a second tap on the same crumb
  // within the double-tap window scrolls the document to the choice scene.
  const lastCrumbPressRef = useRef<{ choiceStepId: string; time: number } | null>(null);

  const handleCrumbPress = useCallback((crumb: BranchBreadcrumbItem) => {
    const now = Date.now();
    const last = lastCrumbPressRef.current;
    lastCrumbPressRef.current = { choiceStepId: crumb.choiceStepId, time: now };
    if (last && last.choiceStepId === crumb.choiceStepId && now - last.time < 320) {
      lastCrumbPressRef.current = null;
      setOpenChoiceStepId(null);
      onNavigateToScene?.(crumb.sceneId);
      return;
    }
    setOpenChoiceStepId((current) => (current === crumb.choiceStepId ? null : crumb.choiceStepId));
  }, [onNavigateToScene]);

  const handleOptionPress = useCallback(
    (info: VNPlateBranchInfo, optionId: string) => {
      setOpenChoiceStepId(null);
      if (optionId === info.selectedOptionId) {
        // Already on this branch — just bring the choice scene into view.
        onNavigateToScene?.(info.sceneId);
        return;
      }
      const option = info.options.find((entry) => entry.optionId === optionId);
      if (!option || option.isBroken) return;
      if (option.isEmpty) {
        onStartBranchOption?.(info.choiceStepId, optionId);
      } else {
        onSelectChoiceOption?.(info.choiceStepId, optionId);
      }
    },
    [onNavigateToScene, onSelectChoiceOption, onStartBranchOption],
  );

  return (
    <View style={{ zIndex: 20 }}>
      <View
        accessibilityLabel={t('document.breadcrumb.a11yLabel')}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors['surface-1'],
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: isPhone ? 14 : 18,
            paddingVertical: 9,
          }}
        >
          <Pressable
            accessibilityRole="button"
            disabled={!onNavigateToScene || !startSceneId}
            onPress={() => startSceneId && onNavigateToScene?.(startSceneId)}
            hitSlop={6}
          >
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>
              {t('document.breadcrumb.start')}
            </Text>
          </Pressable>

          {crumbs.map((crumb) => {
            const isOpen = crumb.choiceStepId === openChoiceStepId;
            return (
              <React.Fragment key={crumb.choiceStepId}>
                <Separator color={colors.muted} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('document.breadcrumb.a11yCrumb', { label: crumbLabel(crumb) })}
                  onPress={() => handleCrumbPress(crumb)}
                  hitSlop={6}
                  style={{
                    borderBottomWidth: 2,
                    borderBottomColor: isOpen ? crumb.color : 'transparent',
                    paddingBottom: 1,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: crumb.color, fontSize: 13, fontWeight: '700', maxWidth: 220 }}>
                    {crumbLabel(crumb)}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}

          <Separator color={colors.muted} />
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 13, fontWeight: '600', maxWidth: 240 }}>
            {currentLabel}
          </Text>
        </ScrollView>
      </View>

      {openInfo ? (
        <View
          style={{
            position: 'absolute',
            top: '100%',
            left: isPhone ? 10 : 18,
            right: isPhone ? 10 : undefined,
            minWidth: isPhone ? undefined : 280,
            maxWidth: 420,
            marginTop: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors['surface-1'],
            paddingVertical: 6,
            shadowColor: '#000000',
            shadowOpacity: 0.12,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          {openInfo.options.map((option, optionIndex) => {
            const isSelected = option.optionId === openInfo.selectedOptionId;
            const color = branchColorForOptionIndex(optionIndex);
            const badge = option.isBroken
              ? t('document.breadcrumb.brokenBranch')
              : option.isEmpty
                ? t('document.breadcrumb.emptyBranch')
                : null;
            return (
              <Pressable
                key={option.optionId}
                accessibilityRole="button"
                disabled={option.isBroken}
                onPress={() => handleOptionPress(openInfo, option.optionId)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  opacity: option.isBroken ? 0.45 : 1,
                  backgroundColor: pressed ? colors.background : 'transparent',
                })}
              >
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    color: colors.foreground,
                    fontSize: 13,
                    fontWeight: isSelected ? '800' : '500',
                  }}
                >
                  {option.text.trim() || t('document.breadcrumb.option', { number: optionIndex + 1 })}
                </Text>
                {badge ? (
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{badge}</Text>
                ) : null}
                {isSelected ? (
                  <Text style={{ color, fontSize: 13, fontWeight: '800' }}>✓</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
