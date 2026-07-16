import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, Platform, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useApi } from '@/hooks/useApi';
import * as Haptics from 'expo-haptics';

const CONTACT_TIMES = ['Morning (8am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)', 'Any time'];
const PRODUCT_MODELS = ['UCF-500 RO System', 'UCF-200 UF System', 'UCF-UV100 UV Purifier', 'UCF-WH1000 Whole-House', 'Other'];

export default function NewTicketScreen() {
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const [productModel, setProductModel] = useState('');
  const [issue, setIssue] = useState('');
  const [contactTime, setContactTime] = useState(CONTACT_TIMES[3]!);
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function pickPhoto() {
    if (photos.length >= 4) { Alert.alert('Maximum', 'You can attach up to 4 photos.'); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow photo access to attach photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos(prev => [...prev, result.assets[0]!.uri]);
    }
  }

  async function submit() {
    if (!productModel || !issue) {
      Alert.alert('Missing info', 'Please select a product model and describe the issue.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await api.createTicket({ productModel, issueDescription: issue, preferredContactTime: contactTime, photos });
      router.push('/(tabs)/support');
      Alert.alert('Submitted!', 'Your maintenance ticket has been received. We will contact you shortly.');
    } catch {
      Alert.alert('Error', 'Failed to submit ticket. Please try again.');
    } finally { setSubmitting(false); }
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: Platform.OS === 'web' ? 34 : 40 }}
      keyboardShouldPersistTaps="handled">

      {/* Product model */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Product Model *</Text>
        <View style={styles.chips}>
          {PRODUCT_MODELS.map(m => (
            <TouchableOpacity key={m} onPress={() => setProductModel(m)} activeOpacity={0.8}
              style={[styles.chip, { backgroundColor: productModel === m ? colors.primary : colors.surface, borderColor: productModel === m ? colors.primary : colors.border }]}>
              <Text style={{ fontSize: 13, color: productModel === m ? '#fff' : colors.mutedForeground, fontWeight: '500' as const }}>{m}</Text>
            </TouchableOpacity>
          ))}
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

      {/* Photos */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.text }]}>Attach Photos ({photos.length}/4)</Text>
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <View key={i} style={styles.photoWrap}>
              <Image source={{ uri }} style={styles.photo} />
              <TouchableOpacity onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                style={[styles.removePhoto, { backgroundColor: colors.destructive }]}>
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 4 && (
            <TouchableOpacity onPress={pickPhoto} activeOpacity={0.8}
              style={[styles.addPhoto, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Ionicons name="camera-outline" size={24} color={colors.mutedForeground} />
              <Text style={[styles.addPhotoText, { color: colors.mutedForeground }]}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  textarea: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 21, minHeight: 120, textAlignVertical: 'top' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 80, height: 80, borderRadius: 10, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  removePhoto: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addPhotoText: { fontSize: 11 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, paddingVertical: 16 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
});
