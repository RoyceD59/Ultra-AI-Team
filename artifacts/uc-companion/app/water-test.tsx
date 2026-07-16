import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';
import MediaPicker, { MediaItem } from '@/components/MediaPicker';

const WATER_SOURCES = ['Municipal/Tap', 'Borehole', 'Well', 'Rainwater', 'River/Lake', 'Tanker delivery'];
const CONCERNS = ['Bad taste or odor', 'Discolouration', 'Hardness / scale buildup', 'Skin irritation', 'Gastrointestinal issues', 'General safety check'];

export default function WaterTestScreen() {
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const [name, setName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [waterSource, setWaterSource] = useState('');
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [extraConcerns, setExtraConcerns] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toggleConcern = (c: string) => {
    setSelectedConcerns(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
  };

  async function submit() {
    if (!name || !address || !phone || !waterSource) {
      Alert.alert('Required fields', 'Please fill in name, address, phone, and water source.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const photos = media.filter(m => m.type === 'photo').map(m => m.uri);
      const videos = media.filter(m => m.type === 'video').map(m => m.uri);
      await api.createWaterTest({
        name, address, phone, waterSource,
        concerns: [...selectedConcerns, extraConcerns].filter(Boolean).join(', '),
        photos,
        videos,
      });
      setSubmitted(true);
    } catch {
      Alert.alert('Error', 'Submission failed. Please try again.');
    } finally { setSubmitting(false); }
  }

  if (submitted) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 40 }]}>
        <View style={[styles.successIcon, { backgroundColor: colors.successLight }]}>
          <Ionicons name="checkmark-circle" size={52} color={colors.success} />
        </View>
        <Text style={[styles.successTitle, { color: colors.text }]}>Request Submitted!</Text>
        <Text style={[styles.successDesc, { color: colors.mutedForeground }]}>
          Our certified technician will contact you within 24 hours to schedule a convenient time for your free water quality test.
        </Text>
        <TouchableOpacity onPress={() => router.back()}
          style={[styles.doneBtn, { backgroundColor: colors.primary }]}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: Platform.OS === 'web' ? 34 : 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.header, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
        <Ionicons name="flask" size={28} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Free Water Quality Test</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Certified technician visits you at no charge</Text>
        </View>
      </View>

      {/* Contact details */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Details</Text>
        {[
          { label: 'Full Name', value: name, onChange: setName, placeholder: 'Jane Doe' },
          { label: 'Address / Location', value: address, onChange: setAddress, placeholder: 'Westlands, Nairobi' },
          { label: 'Phone Number', value: phone, onChange: setPhone, placeholder: '+254700000000', keyboard: 'phone-pad' as const },
        ].map(f => (
          <View key={f.label} style={styles.field}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
            <TextInput value={f.value} onChangeText={f.onChange} placeholder={f.placeholder}
              placeholderTextColor={colors.border} keyboardType={f.keyboard}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]} />
          </View>
        ))}
      </View>

      {/* Water source */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Water Source *</Text>
        <View style={styles.chips}>
          {WATER_SOURCES.map(s => (
            <TouchableOpacity key={s} onPress={() => setWaterSource(s)} activeOpacity={0.8}
              style={[styles.chip, { backgroundColor: waterSource === s ? colors.primary : colors.surface, borderColor: waterSource === s ? colors.primary : colors.border }]}>
              <Text style={{ fontSize: 13, color: waterSource === s ? '#fff' : colors.mutedForeground, fontWeight: '500' as const }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Concerns */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Concerns (select all that apply)</Text>
        <View style={styles.chips}>
          {CONCERNS.map(c => (
            <TouchableOpacity key={c} onPress={() => toggleConcern(c)} activeOpacity={0.8}
              style={[styles.chip, { backgroundColor: selectedConcerns.includes(c) ? colors.accent + '20' : colors.surface, borderColor: selectedConcerns.includes(c) ? colors.accent : colors.border }]}>
              <Text style={{ fontSize: 12, color: selectedConcerns.includes(c) ? colors.accent : colors.mutedForeground, fontWeight: '500' as const }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput value={extraConcerns} onChangeText={setExtraConcerns}
          placeholder="Any other concerns..." placeholderTextColor={colors.border} multiline numberOfLines={3}
          style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]} />
      </View>

      {/* Media attachments */}
      <View style={styles.section}>
        <MediaPicker
          items={media}
          onChange={setMedia}
          maxItems={4}
          label="Attach Photos & Videos  (optional)"
        />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Photos or short videos of your water sample or source help our technician prepare.
        </Text>
      </View>

      <TouchableOpacity onPress={submit} disabled={submitting}
        style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}>
        {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Book Water Test</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  headerTitle: { fontSize: 15, fontWeight: '700' as const },
  headerSub: { fontSize: 12, marginTop: 2 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600' as const },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '500' as const },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  textarea: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 20, minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 18 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 16 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  successIcon: { width: 90, height: 90, borderRadius: 45, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 24, fontWeight: '700' as const },
  successDesc: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  doneBtn: { paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12, marginTop: 8 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
});
