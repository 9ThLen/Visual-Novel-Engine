/**
 * components/editor/PropertiesPanel.tsx — Right panel with form fields
 * Shows properties for all 12 block types.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { BLOCK_TYPE_INFO, type TimelineStep } from '@/lib/engine/types';
import { AssetPicker } from './modals/AssetPicker';

interface Props {
  block: TimelineStep;
  onUpdate: (updates: Partial<TimelineStep>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onClose: () => void;
}

export function PropertiesPanel({ block, onUpdate, onDelete, onDuplicate, onClose }: Props) {
  const colors = useColors();
  const info = BLOCK_TYPE_INFO[block.blockType];
  const data = block.data as any;
  const upd = (field: string, value: any) => onUpdate({ data: { ...data, [field]: value } });

  const [picker, setPicker] = useState<{ visible: boolean; category: string; onSelect: (id: string) => void }>({ visible: false, category: 'backgrounds', onSelect: () => {} });

  const openPicker = (category: string, currentValue: string | null, onChange: (id: string) => void) => {
    setPicker({ visible: true, category, onSelect: (id: string) => { onChange(id); setPicker(prev => ({ ...prev, visible: false })); } });
  };

  const renderAssetField = (label: string, category: string, value: string | null, onChange: (v: string) => void) => (
    <Field label={label} colors={colors}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TextInput value={value || ''} onChangeText={onChange} placeholder={`Select ${category}...`} placeholderTextColor={colors.muted} style={[S(colors), { flex: 1 }]} />
        <Pressable onPress={() => openPicker(category, value, onChange)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}>
          <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>Browse</Text>
        </Pressable>
      </View>
    </Field>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, borderLeftWidth: 4, borderLeftColor: info.color }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Text style={{ fontSize: 16, marginRight: 6 }}>{info.icon}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.foreground }}>{info.label}</Text>
        </View>
        <Pressable onPress={onClose} style={{ padding: 4 }}>
          <Text style={{ fontSize: 14, color: colors.muted }}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {renderForm(block, data, upd, colors, openPicker, renderAssetField)}
      </ScrollView>

      {picker.visible && (
        <AssetPicker
          visible
          category={picker.category as any}
          onSelect={picker.onSelect}
          onClose={() => setPicker(prev => ({ ...prev, visible: false }))}
        />
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
        <Pressable onPress={onDuplicate} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: '600' }}>📋 Duplicate</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: (colors.error || '#ff6b6b') + '20' }}>
          <Text style={{ fontSize: 12, color: colors.error || '#ff6b6b', fontWeight: '600' }}>🗑 Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

const S = (c: any) => ({ backgroundColor: c.background, borderWidth: 1, borderColor: c.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: c.foreground });

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: colors.muted, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

function OptBtns({ options, value, onChange, colors }: { options: string[]; value: string; onChange: (v: string) => void; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <Pressable key={o} onPress={() => onChange(o)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: value === o ? colors.primary : colors.background, borderWidth: 1, borderColor: value === o ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 11, color: value === o ? '#fff' : colors.foreground, fontWeight: '500' }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Toggle({ label, value, onChange, colors }: { label: string; value: boolean; onChange: (v: boolean) => void; colors: any }) {
  return (
    <Field label={label} colors={colors}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Pressable onPress={() => onChange(true)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: value ? colors.primary : colors.background, borderWidth: 1, borderColor: value ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 11, color: value ? '#fff' : colors.foreground, fontWeight: '500' }}>Yes</Text>
        </Pressable>
        <Pressable onPress={() => onChange(false)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: !value ? colors.primary : colors.background, borderWidth: 1, borderColor: !value ? colors.primary : colors.border }}>
          <Text style={{ fontSize: 11, color: !value ? '#fff' : colors.foreground, fontWeight: '500' }}>No</Text>
        </Pressable>
      </View>
    </Field>
  );
}

function renderForm(block: TimelineStep, data: any, upd: (f: string, v: any) => void, colors: any, openPicker?: (category: string, current: string | null, onChange: (id: string) => void) => void, assetField?: (label: string, category: string, value: string | null, onChange: (v: string) => void) => React.ReactNode) {
  switch (block.blockType) {
    case 'background':
      return (<>
        {assetField ? assetField('Asset', 'backgrounds', data.assetId, v => upd('assetId', v)) : <Field label="Asset" colors={colors}><TextInput value={data.assetId || ''} onChangeText={v => upd('assetId', v)} placeholder="Select background..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
        <Field label="Transition" colors={colors}><OptBtns options={['fade','dissolve','instant','wipe']} value={data.transition} onChange={v => upd('transition', v)} colors={colors} /></Field>
        <Field label="Duration (ms)" colors={colors}><TextInput value={String(data.duration || 500)} onChangeText={v => upd('duration', parseInt(v)||500)} placeholder="500" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    case 'character':
      return (<>
        {assetField ? assetField('Character', 'characters', data.characterId, v => upd('characterId', v)) : <Field label="Character" colors={colors}><TextInput value={data.characterId || ''} onChangeText={v => upd('characterId', v)} placeholder="Select character..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
        {assetField ? assetField('Sprite', 'sprites', data.spriteId, v => upd('spriteId', v)) : <Field label="Sprite" colors={colors}><TextInput value={data.spriteId || ''} onChangeText={v => upd('spriteId', v)} placeholder="Select sprite..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
        <Field label="Position" colors={colors}><OptBtns options={['far-left','left','center','right','far-right']} value={data.position} onChange={v => upd('position', v)} colors={colors} /></Field>
        <Field label="Entrance" colors={colors}><OptBtns options={['instant','fade','slide-left','slide-right','zoom']} value={data.transition} onChange={v => upd('transition', v)} colors={colors} /></Field>
        <Field label="Delay (seconds)" colors={colors}><TextInput value={String(data.delay || 0)} onChangeText={v => upd('delay', parseFloat(v)||0)} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Duration (seconds, empty=permanent)" colors={colors}><TextInput value={data.duration ? String(data.duration) : ''} onChangeText={v => upd('duration', v ? parseFloat(v) : null)} placeholder="empty = permanent" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    case 'text':
      return (<>
        <Field label="Content" colors={colors}><TextInput value={data.content || ''} onChangeText={v => upd('content', v)} placeholder="Enter narration text..." placeholderTextColor={colors.muted} multiline numberOfLines={4} style={[S(colors), { minHeight: 80, textAlignVertical: 'top' }]} /></Field>
        <Field label="Anchor To" colors={colors}><OptBtns options={['background','character']} value={data.anchorTo} onChange={v => upd('anchorTo', v)} colors={colors} /></Field>
        <Field label="Typewriter Speed (0-1)" colors={colors}><TextInput value={String(data.typewriterSpeed || 0.5)} onChangeText={v => upd('typewriterSpeed', parseFloat(v)||0.5)} placeholder="0.5" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    case 'dialogue':
      return (<>
        {data.entries?.map((entry: any, i: number) => (
          <View key={entry.id || i} style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: colors.muted, marginBottom: 6 }}>Speaker {i + 1}</Text>
            {assetField ? assetField('Character', 'characters', entry.characterId, v => { const e = [...data.entries]; e[i] = { ...entry, characterId: v }; upd('entries', e); }) : <Field label="Character" colors={colors}><TextInput value={entry.characterId || ''} onChangeText={v => { const e = [...data.entries]; e[i] = { ...entry, characterId: v }; upd('entries', e); }} placeholder="Select character..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
            <Field label="Text" colors={colors}><TextInput value={entry.text || ''} onChangeText={v => { const e = [...data.entries]; e[i] = { ...entry, text: v }; upd('entries', e); }} placeholder="Enter dialogue..." placeholderTextColor={colors.muted} multiline numberOfLines={3} style={[S(colors), { minHeight: 60, textAlignVertical: 'top' }]} /></Field>
          </View>
        ))}
        <Pressable onPress={() => upd('entries', [...(data.entries||[]), { id: `e_${Date.now()}`, characterId: '', spriteId: '', text: '' }])} style={{ paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>+ Add Speaker</Text>
        </Pressable>
      </>);

    case 'choice':
      return (<>
        {data.options?.map((opt: any, i: number) => (
          <View key={opt.id || i} style={{ marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: colors.muted, marginBottom: 6 }}>Choice {i + 1}</Text>
            <Field label="Text" colors={colors}><TextInput value={opt.text || ''} onChangeText={v => { const o = [...data.options]; o[i] = { ...opt, text: v }; upd('options', o); }} placeholder="Enter choice text..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>
            <Field label="Target Scene" colors={colors}><TextInput value={opt.targetSceneId || ''} onChangeText={v => { const o = [...data.options]; o[i] = { ...opt, targetSceneId: v||null }; upd('options', o); }} placeholder="empty = end scene" placeholderTextColor={colors.muted} style={S(colors)} /></Field>
          </View>
        ))}
        {(data.options?.length || 0) < 20 && (
          <Pressable onPress={() => upd('options', [...(data.options||[]), { id: `c_${Date.now()}`, text: '', targetSceneId: null }])} style={{ paddingVertical: 8, alignItems: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>+ Add Choice</Text>
          </Pressable>
        )}
      </>);

    case 'effect':
      return (<>
        <Field label="Effect Type" colors={colors}><OptBtns options={['shake','flash','blur','rain','snow','glitch','vignette']} value={data.effectType} onChange={v => upd('effectType', v)} colors={colors} /></Field>
        <Field label="Target" colors={colors}><OptBtns options={['screen','character','background']} value={data.target} onChange={v => upd('target', v)} colors={colors} /></Field>
        <Field label="Intensity (0-100)" colors={colors}><TextInput value={String(data.intensity || 50)} onChangeText={v => upd('intensity', parseInt(v)||50)} placeholder="50" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Duration (seconds)" colors={colors}><TextInput value={String(data.duration || 0.5)} onChangeText={v => upd('duration', parseFloat(v)||0.5)} placeholder="0.5" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    case 'music':
      return (<>
        {assetField ? assetField('Asset', 'music', data.assetId, v => upd('assetId', v)) : <Field label="Asset" colors={colors}><TextInput value={data.assetId || ''} onChangeText={v => upd('assetId', v)} placeholder="Select music..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
        <Field label="Action" colors={colors}><OptBtns options={['play','stop','pause','fade']} value={data.action} onChange={v => upd('action', v)} colors={colors} /></Field>
        <Field label="Volume (0-100)" colors={colors}><TextInput value={String(Math.round((data.volume||0.8)*100))} onChangeText={v => upd('volume', (parseInt(v)||80)/100)} placeholder="80" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Toggle label="Loop" value={!!data.loop} onChange={v => upd('loop', v)} colors={colors} />
        <Field label="Fade Duration (ms)" colors={colors}><TextInput value={String(data.fadeDuration || 1000)} onChangeText={v => upd('fadeDuration', parseInt(v)||1000)} placeholder="1000" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    case 'sound':
      return (<>
        {assetField ? assetField('Asset', 'sfx', data.assetId, v => upd('assetId', v)) : <Field label="Asset" colors={colors}><TextInput value={data.assetId || ''} onChangeText={v => upd('assetId', v)} placeholder="Select sound..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
        <Field label="Action" colors={colors}><OptBtns options={['play','stop']} value={data.action} onChange={v => upd('action', v)} colors={colors} /></Field>
        <Field label="Volume (0-100)" colors={colors}><TextInput value={String(Math.round((data.volume||0.8)*100))} onChangeText={v => upd('volume', (parseInt(v)||80)/100)} placeholder="80" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Toggle label="Loop" value={!!data.loop} onChange={v => upd('loop', v)} colors={colors} />
        <Field label="Pitch Variation (0-100)" colors={colors}><TextInput value={String(Math.round((data.pitchVariation||0)*100))} onChangeText={v => upd('pitchVariation', (parseInt(v)||0)/100)} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    case 'interactive_object':
      return (<>
        <Field label="Object Name" colors={colors}><TextInput value={data.name || ''} onChangeText={v => upd('name', v)} placeholder="Enter object name..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>
        {assetField ? assetField('Sprite', 'sprites', data.assetId, v => upd('assetId', v)) : <Field label="Sprite" colors={colors}><TextInput value={data.assetId || ''} onChangeText={v => upd('assetId', v)} placeholder="Select sprite..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>}
        <Field label="Position X (%)" colors={colors}><TextInput value={String(data.position?.x ?? 50)} onChangeText={v => upd('position', { ...(data.position||{}), x: parseInt(v)||0 })} placeholder="50" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Position Y (%)" colors={colors}><TextInput value={String(data.position?.y ?? 50)} onChangeText={v => upd('position', { ...(data.position||{}), y: parseInt(v)||0 })} placeholder="50" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Width (%)" colors={colors}><TextInput value={String(data.position?.width ?? 10)} onChangeText={v => upd('position', { ...(data.position||{}), width: parseInt(v)||10 })} placeholder="10" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Height (%)" colors={colors}><TextInput value={String(data.position?.height ?? 10)} onChangeText={v => upd('position', { ...(data.position||{}), height: parseInt(v)||10 })} placeholder="10" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Toggle label="Pulse Animation" value={!!data.pulseAnimation} onChange={v => upd('pulseAnimation', v)} colors={colors} />
        <Toggle label="One Time Only" value={!!data.oneTimeOnly} onChange={v => upd('oneTimeOnly', v)} colors={colors} />
      </>);

    case 'camera':
      return (<>
        <Field label="Action" colors={colors}><OptBtns options={['zoom','pan','focus','reset']} value={data.action} onChange={v => upd('action', v)} colors={colors} /></Field>
        <Field label="Zoom Level" colors={colors}><TextInput value={String(data.zoomLevel || 1.0)} onChangeText={v => upd('zoomLevel', parseFloat(v)||1.0)} placeholder="1.0" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Duration (seconds)" colors={colors}><TextInput value={String(data.duration || 1.0)} onChangeText={v => upd('duration', parseFloat(v)||1.0)} placeholder="1.0" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
        <Field label="Easing" colors={colors}><OptBtns options={['linear','ease-in','ease-out','ease-in-out']} value={data.easing} onChange={v => upd('easing', v)} colors={colors} /></Field>
      </>);

    case 'variable':
      return (<>
        <Field label="Variable Name" colors={colors}><TextInput value={data.variableName || ''} onChangeText={v => upd('variableName', v)} placeholder="Enter variable name..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>
        <Field label="Operation" colors={colors}><OptBtns options={['set','add','subtract','multiply','toggle']} value={data.operation} onChange={v => upd('operation', v)} colors={colors} /></Field>
        {data.operation === 'toggle' ? (
          <Toggle label="Value" value={data.value === true || data.value === 'true'} onChange={v => upd('value', v)} colors={colors} />
        ) : (
          <Field label="Value" colors={colors}><TextInput value={String(data.value ?? '')} onChangeText={v => upd('value', v === '' ? v : isNaN(Number(v)) ? v : Number(v))} placeholder="Enter value..." placeholderTextColor={colors.muted} style={S(colors)} /></Field>
        )}
      </>);

    case 'transition':
      return (<>
        <Field label="Target Scene" colors={colors}><TextInput value={data.targetSceneId || ''} onChangeText={v => upd('targetSceneId', v||null)} placeholder="Select target scene (empty = end)" placeholderTextColor={colors.muted} style={S(colors)} /></Field>
        <Field label="Transition Type" colors={colors}><OptBtns options={['fade','dissolve','slide-left','slide-right','slide-up','wipe']} value={data.transitionType} onChange={v => upd('transitionType', v)} colors={colors} /></Field>
        <Field label="Duration (seconds)" colors={colors}><TextInput value={String(data.duration || 1.0)} onChangeText={v => upd('duration', parseFloat(v)||1.0)} placeholder="1.0" placeholderTextColor={colors.muted} keyboardType="numeric" style={S(colors)} /></Field>
      </>);

    default:
      return (
        <View style={{ padding: 12, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>
            Properties for {block.blockType} block are not yet implemented.
          </Text>
        </View>
      );
  }
}
