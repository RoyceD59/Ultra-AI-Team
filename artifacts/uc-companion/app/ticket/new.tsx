import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useApi } from '@/hooks/useApi';
import * as Haptics from 'expo-haptics';
import MediaPicker, { MediaItem } from '@/components/MediaPicker';

const CONTACT_TIMES = ['Morning (8am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)', 'Any time'];

/**
 * Real 2026 Ultra Clear product catalogue, grouped by segment.
 * "Other" is kept as the catch-all final option.
 */
const PRODUCT_SEGMENTS: { segment: string; models: string[] }[] = [
  {
    segment: 'Bottles & Portable',
    models: ['Hydra Flux', 'Truva Go', 'Viva Drop', 'Flex', 'Timbo', 'Gym Buddy', 'Survivor Straw', 'Breeze', 'EcoSmart Elite'],
  },
  {
    segment: 'Home Filters',
    models: ['Sweet Home', 'Counter Reverse Osmosis', 'Electric Pitcher', 'RO Home System'],
  },
  {
    segment: 'Shower & Skin',
    models: ["J'adore", 'Channel', 'Derma Care', 'Pure Drop', 'Derma Flux'],
  },
  {
    segment: 'Accessories',
    models: ['Bottle Filter Cartridge', 'Faucet Filter Cartridge', 'Shower Filter Cartridge', 'Derma Flux Cartridge', 'Survivor Straw Cartridge', 'Filter Shell', 'Bottle Carry Sleeve'],
  },
  {
    segment: 'Solutions',
    models: ['Aqua Stream 1200', 'Water ATMs'],
  },
];

export default function NewTicketScreen() {
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const [productModel, setProductModel] = useState('');
  const [issue, setIssue] = useState('');
  const [contactTime, setContactTime] = useState(CONTACT_TIMES[3]!);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!productModel || !issue) {
      Alert.alert('Missing info', 'Please select a product model and describe the issue.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const photos = media.filter(m => m.type === 'photo').map(m => m.uri);
      const videos = media.filter(m => m.type === 'video').map(m => m.uri);
      await api.createTicket({ productModel, issueDescription: issue, preferredContactTime: contactTime, photos, videos });
      router.push('/(tabs)/support');
      Alert.alert('Submitted!', 'Your maintenance ticket has been received. We will contact you shortly.');
    } catch {
      Alert.alert('Error', 'Failed to submit ticket. Please try again.');
    } finally { setSubmitting(false); }
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: Platform.OS === 'web' ? 34 : 40 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Product model — grouped by segment */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Product Model *</Text>
        {PRODUCT_SEGMENTS.map(seg => (
          <View key={seg.segment} style={styles.segmentBlock}>
            <Text style={[styles.segmentLabel, { color: colors.mutedForeground }]}>{seg.segment}</Text>
            <View style={styles.chips}>
              {seg.models.map(m => (
                <TouchableOpacity key={m} onPress={() => setProductModel(m)} activeOpacity={0.8}
                  style={[styles.chip, { backgroundColor: productModel === m ? colors.primary : colors.surface, borderColor: productModel === m ? colors.primary : colors.border }]}>
                  <Text style={{ fontSize: 12, color: productModel === m ? '#fff' : colors.mutedForeground, fontWeight: '500' as const }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
        {/* Other — catch-all */}
        <View style={styles.chips}>
          <TouchableOpacity onPress={() => setProductModel('Other')} activeOpacity={0.8}
            style={[styles.chip, { backgroundColor: productModel === 'Other' ? colors.primary : colors.surface, borderColor: productModel === 'Other' ? colors.primary : colors.border }]}>
            <Text style={{ fontSize: 12, color: productModel === 'Other' ? '#fff' : colors.mutedForeground, fontWeight: '500' as const }}>Other</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Issue description */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Describe the Issue *</Text>
        <TextInput
          value={issue}
          onChangeText={setIssue}
          multiline
          numberOfLines={5}
          placeholder="What's happening with your system? Include any error messages, unusual sounds, or changes in water quality..."
          placeholderTextColor={colors.border}
          style={[styles.textarea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        />
      </View>

      {/* Contact time */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Preferred Contact Time</Text>
        <View style={styles.chips}>
          {CONTACT_TIMES.map(t => (
            <TouchableOpacity key={t} onPress={() => setContactTime(t)} activeOpacity={0.8}
              style={[styles.chip, { backgroundColor: contactTime === t ? colors.primary : colors.surface, borderColor: contactTime === t ? colors.primary : colors.border }]}>
              <Text style={{ fontSize: 12, color: contactTime === t ? '#fff' : colors.mutedForeground, fontWeight: '500' as const }}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Media attachments */}
      <View style={styles.section}>
        <MediaPicker
          items={media}
          onChange={setMedia}
          maxItems={6}
          label="Attach Photos & Videos"
        />
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Up to 6 items · Videos capped at 15 seconds · Tap a video thumbnail to preview
        </Text>
      </View>

      {/* Submit */}
      <TouchableOpacity onPress={submit} disabled={submitting}
        style={[styles.submitBtn, { backgroundColor: submitting ? colors.muted : colors.primary }]}>
        {submitting ? <ActivityIndicator color="#fff" size="small" /> : (
          <>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Submit Ticket</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  section: { gap: 10 },
  label: { fontSize: 15, fontWeight: '600' as const },
  segmentBlock: { gap: 6 },
  segmentLabel: { fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase', letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 21, minHeight: 120, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 18 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 16 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
});
