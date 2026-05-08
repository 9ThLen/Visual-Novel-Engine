import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Block } from '../../lib/block-types';
import { getBlockEntry } from '../../lib/block-registry';

interface Colors {
  foreground: string;
  background: string;
  surface: string;
  border: string;
  muted: string;
  primary: string;
}

interface Props {
  block: Block;
  onChange: (data: Record<string, any>) => void;
  onClose: () => void;
  sceneList: string[];
  characterList: string[];
  colors: Colors;
}

const inp = (c: Colors, extra: object = {}): object => ({
  backgroundColor: c.background,
  borderRadius: 6,
  borderWidth: 1,
  borderColor: c.border,
  paddingHorizontal: 10,
  paddingVertical: 8,
  color: c.foreground,
  fontSize: 13,
  ...extra,
});

const FRow: React.FC<{ label: string; colors: Colors; children: React.ReactNode }> = ({ label, colors, children }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, marginBottom: 4 }}>{label}</Text>
    {children}
  </View>
);

const SInput: React.FC<{ value: string; onChange: (v: string) => void; options: { label: string; value: string }[]; colors: Colors }> = ({ value, onChange, options, colors }) => (
  <View style={{ backgroundColor: colors.background, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
    {options.map((opt) => (
      <Pressable key={opt.value} onPress={() => onChange(opt.value)} style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: value === opt.value ? colors.primary : 'transparent' }}>
        <Text style={{ fontSize: 13, color: value === opt.value ? '#fff' : colors.foreground, fontWeight: value === opt.value ? '600' : '400' }}>{opt.label}</Text>
      </Pressable>
    ))}
  </View>
);

const SegCtl: React.FC<{ options: { label: string; value: string }[]; value: string; onChange: (v: string) => void; colors: Colors }> = ({ options, value, onChange, colors }) => (
  <View style={{ flexDirection: 'row', backgroundColor: colors.background, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 2 }}>
    {options.map((opt) => (
      <Pressable key={opt.value} onPress={() => onChange(opt.value)} style={{ flex: 1, paddingVertical: 6, borderRadius: 4, backgroundColor: value === opt.value ? colors.primary : 'transparent', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: value === opt.value ? '#fff' : colors.foreground, fontWeight: '600' }}>{opt.label}</Text>
      </Pressable>
    ))}
  </View>
);

export const BlockConfigPanel: React.FC<Props> = ({ block, onChange, onClose, sceneList, characterList, colors }) => {
  const entry = getBlockEntry(block.type);
  const d = block.data;
  const sf = (field: string, value: any) => onChange({ ...d, [field]: value });

  const render = () => {
    switch (block.type) {
      case 'dialogue': return (<>
        <FRow label="Character" colors={colors}><SInput value={d.character || ''} onChange={(v) => sf('character', v)} options={characterList.map((c) => ({ label: c, value: c }))} colors={colors} /></FRow>
        <FRow label="Text" colors={colors}><TextInput style={inp(colors)} value={d.text || ''} onChangeText={(v) => sf('text', v)} placeholder="What do they say?" placeholderTextColor={colors.muted} multiline /></FRow>
      </>);
      case 'narration': return (
        <FRow label="Narration text" colors={colors}><TextInput style={[inp(colors), { minHeight: 80 }]} value={d.text || ''} onChangeText={(v) => sf('text', v)} placeholder="Describe the scene..." placeholderTextColor={colors.muted} multiline textAlignVertical="top" /></FRow>
      );
      case 'show_character': return (<>
        <FRow label="Character" colors={colors}><SInput value={d.characterId || ''} onChange={(v) => sf('characterId', v)} options={characterList.map((c) => ({ label: c, value: c }))} colors={colors} /></FRow>
        <FRow label="Position" colors={colors}><SegCtl options={[{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }]} value={d.position || 'center'} onChange={(v) => sf('position', v)} colors={colors} /></FRow>
        <FRow label="Expression" colors={colors}><TextInput style={inp(colors)} value={d.expression || ''} onChangeText={(v) => sf('expression', v)} placeholder="neutral, happy, sad..." placeholderTextColor={colors.muted} /></FRow>
      </>);
      case 'hide_character': return (
        <FRow label="Character" colors={colors}><SInput value={d.characterId || ''} onChange={(v) => sf('characterId', v)} options={characterList.map((c) => ({ label: c, value: c }))} colors={colors} /></FRow>
      );
      case 'character_animation': return (<>
        <FRow label="Character" colors={colors}><SInput value={d.characterId || ''} onChange={(v) => sf('characterId', v)} options={characterList.map((c) => ({ label: c, value: c }))} colors={colors} /></FRow>
        <FRow label="Animation" colors={colors}><SInput value={d.animation || ''} onChange={(v) => sf('animation', v)} options={[{ label: 'Shake', value: 'shake' }, { label: 'Bounce', value: 'bounce' }, { label: 'Slide Left', value: 'slide_in_left' }, { label: 'Slide Right', value: 'slide_in_right' }, { label: 'Fade In', value: 'fade_in' }, { label: 'Fade Out', value: 'fade_out' }]} colors={colors} /></FRow>
      </>);
      case 'set_background': return (
        <FRow label="Background URI" colors={colors}><TextInput style={inp(colors)} value={d.backgroundUri || ''} onChangeText={(v) => sf('backgroundUri', v)} placeholder="file://..." placeholderTextColor={colors.muted} /></FRow>
      );
      case 'play_music': return (<>
        <FRow label="Music file URI" colors={colors}><TextInput style={inp(colors)} value={d.musicUri || ''} onChangeText={(v) => sf('musicUri', v)} placeholder="file://..." placeholderTextColor={colors.muted} /></FRow>
        <FRow label="Volume" colors={colors}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TextInput style={[inp(colors), { width: 60 }]} value={String(d.volume ?? 80)} onChangeText={(v) => sf('volume', Math.min(100, Math.max(0, parseInt(v) || 0)))} keyboardType="numeric" /><Text style={{ color: colors.muted, fontSize: 12 }}>0-100</Text></View></FRow>
        <FRow label="Loop" colors={colors}><Pressable onPress={() => sf('loop', !d.loop)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: d.loop ? colors.primary : 'transparent', justifyContent: 'center', alignItems: 'center' }}>{d.loop && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}</View><Text style={{ color: colors.foreground, fontSize: 13 }}>Repeat</Text></Pressable></FRow>
      </>);
      case 'play_sfx': return (<>
        <FRow label="Sound file URI" colors={colors}><TextInput style={inp(colors)} value={d.sfxUri || ''} onChangeText={(v) => sf('sfxUri', v)} placeholder="file://..." placeholderTextColor={colors.muted} /></FRow>
        <FRow label="Volume" colors={colors}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><TextInput style={[inp(colors), { width: 60 }]} value={String(d.volume ?? 80)} onChangeText={(v) => sf('volume', Math.min(100, Math.max(0, parseInt(v) || 0)))} keyboardType="numeric" /><Text style={{ color: colors.muted, fontSize: 12 }}>0-100</Text></View></FRow>
      </>);
      case 'play_voice': return (
        <FRow label="Voice file URI" colors={colors}><TextInput style={inp(colors)} value={d.voiceUri || ''} onChangeText={(v) => sf('voiceUri', v)} placeholder="file://..." placeholderTextColor={colors.muted} /></FRow>
      );
      case 'choice': return (<>
        <FRow label="Choice text" colors={colors}><TextInput style={inp(colors)} value={d.text || ''} onChangeText={(v) => sf('text', v)} placeholder="What does the player see?" placeholderTextColor={colors.muted} /></FRow>
        <FRow label="Target scene" colors={colors}><SInput value={d.nextSceneId || ''} onChange={(v) => sf('nextSceneId', v)} options={sceneList.map((s) => ({ label: s, value: s }))} colors={colors} /></FRow>
      </>);
      case 'condition': return (<>
        <FRow label="Variable" colors={colors}><TextInput style={inp(colors)} value={d.variable || ''} onChangeText={(v) => sf('variable', v)} placeholder="flag_met, score..." placeholderTextColor={colors.muted} /></FRow>
        <FRow label="Operator" colors={colors}><SInput value={d.operator || 'equals'} onChange={(v) => sf('operator', v)} options={[{ label: 'equals', value: 'equals' }, { label: 'not equals', value: 'not_equals' }, { label: 'greater than', value: 'greater_than' }, { label: 'less than', value: 'less_than' }, { label: 'contains', value: 'contains' }]} colors={colors} /></FRow>
        <FRow label="Value" colors={colors}><TextInput style={inp(colors)} value={d.value || ''} onChangeText={(v) => sf('value', v)} placeholder="Value to compare..." placeholderTextColor={colors.muted} /></FRow>
      </>);
      case 'set_variable': return (<>
        <FRow label="Variable name" colors={colors}><TextInput style={inp(colors)} value={d.variable || ''} onChangeText={(v) => sf('variable', v)} placeholder="flag_met, score..." placeholderTextColor={colors.muted} /></FRow>
        <FRow label="Value" colors={colors}><TextInput style={inp(colors)} value={d.value || ''} onChangeText={(v) => sf('value', v)} placeholder="true, 42, hello..." placeholderTextColor={colors.muted} /></FRow>
      </>);
      case 'transition': return (<>
        <FRow label="Type" colors={colors}><SInput value={d.type || 'fade'} onChange={(v) => sf('type', v)} options={[{ label: 'Fade', value: 'fade' }, { label: 'Dissolve', value: 'dissolve' }, { label: 'Slide Left', value: 'slide_left' }, { label: 'Slide Right', value: 'slide_right' }, { label: 'Wipe', value: 'wipe' }, { label: 'Instant', value: 'instant' }]} colors={colors} /></FRow>
        <FRow label="Duration (ms)" colors={colors}><TextInput style={[inp(colors), { width: 100 }]} value={String(d.duration ?? 500)} onChangeText={(v) => sf('duration', Math.min(5000, Math.max(0, parseInt(v) || 0)))} keyboardType="numeric" /></FRow>
      </>);
      case 'wait': return (
        <FRow label="Duration (ms)" colors={colors}><TextInput style={[inp(colors), { width: 100 }]} value={String(d.duration ?? 1000)} onChangeText={(v) => sf('duration', Math.min(60000, Math.max(0, parseInt(v) || 0)))} keyboardType="numeric" /></FRow>
      );
      case 'group': return (
        <FRow label="Group title" colors={colors}><TextInput style={inp(colors)} value={d.title || ''} onChangeText={(v) => sf('title', v)} placeholder="Group name..." placeholderTextColor={colors.muted} /></FRow>
      );
      default: return <Text style={{ color: colors.muted }}>No config for this block</Text>;
    }
  };

  return (
    <View style={{ width: 300, backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.border, flexDirection: 'column' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: entry.colorLight }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18 }}>{entry.icon}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: entry.borderColor }}>{entry.labelUa}</Text>
        </View>
        <Pressable onPress={onClose} style={{ padding: 4 }}><Text style={{ color: colors.muted, fontSize: 18 }}>✕</Text></Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}><View style={{ padding: 12 }}>{render()}</View></ScrollView>
    </View>
  );
};
