import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import StarRating from '@/components/StarRating';
import MediaPicker, { type MediaItem } from '@/components/MediaPicker';
import { uploadMediaItems } from '@/lib/uploadMedia';

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export default function NewReviewScreen() {
  const { productId, productName } = useLocalSearchParams<{ productId: string; productName?: string }>();
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const pid = parseInt(productId ?? '');

  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Redirect guests to sign-in — reviews are tied to an account.
  useEffect(() => {
    if (!token) router.replace('/auth/login');
  }, [token, router]);

  // Prefill when the user is editing their existing review.
  const { data: existing } = useQuery({
    queryKey: ['reviews', pid],
    queryFn: () => api.getReviews(pid),
    enabled: !!token && !isNaN(pid),
  });
  useEffect(() => {
    if (prefilled || !existing) return;
    const mine = existing.reviews.find((r) => r.mine);
    if (mine) {
      setRating(mine.rating);
      setBody(mine.body);
      // Existing attachments stay on the server review unless re-submitted;
      // show them as already-uploaded items is complex, so we keep it simple:
      // editing replaces attachments with whatever is picked here.
    }
    setPrefilled(true);
  }, [existing, prefilled]);

  const isEditing = existing?.reviews.some((r) => r.mine) ?? false;

  async function submit() {
    if (rating === 0) {
      Alert.alert('Add a rating', 'Please tap the stars to rate this product.');
      return;
    }
    if (body.trim().length < 3) {
      Alert.alert('Add a few words', 'Please write a short review of the product.');
      return;
    }
    const videos = media.filter((m) => m.type === 'video').length;
    if (videos > 1) {
      Alert.alert('Too many videos', 'You can attach one video per review.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      const uploaded = media.length
        ? await uploadMediaItems(media, api.requestUploadUrl, (done, total) => setProgress({ done, total }))
        : [];
      await api.submitReview(pid, { rating, body: body.trim(), media: uploaded });
      await queryClient.invalidateQueries({ queryKey: ['reviews', pid] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        isEditing ? 'Review updated' : 'Asante!',
        isEditing ? 'Your review has been updated.' : 'Thanks for sharing your experience.',
      );
      router.back();
    } catch (e) {
      Alert.alert('Could not submit', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  if (isNaN(pid)) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Product not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: Platform.OS === 'web' ? 34 : 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {productName ? (
        <Text style={[s.productName, { color: colors.mutedForeground }]}>
          Reviewing <Text style={{ color: colors.text, fontWeight: '700' }}>{productName}</Text>
        </Text>
      ) : null}

      {/* Rating */}
      <View style={s.section}>
        <Text style={[s.label, { color: colors.text }]}>Your rating *</Text>
        <View style={s.starsRow}>
          <StarRating rating={rating} size={38} gap={8} onChange={setRating} />
          {rating > 0 && (
            <Text style={[s.ratingLabel, { color: colors.primary }]}>{RATING_LABELS[rating]}</Text>
          )}
        </View>
      </View>

      {/* Text */}
      <View style={s.section}>
        <Text style={[s.label, { color: colors.text }]}>Your review *</Text>
        <TextInput
          style={[s.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          placeholder="How is the water taste? Was it easy to install? Would you recommend it?"
          placeholderTextColor={colors.mutedForeground}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={5}
          maxLength={2000}
          textAlignVertical="top"
        />
      </View>

      {/* Media */}
      <View style={s.section}>
        <MediaPicker items={media} onChange={setMedia} maxItems={4} label="Add photos or a video" />
        <Text style={[s.hint, { color: colors.mutedForeground }]}>
          Up to 4 attachments — photos plus one short video (max 15 s).
        </Text>
        {isEditing && (
          <Text style={[s.hint, { color: colors.mutedForeground }]}>
            Submitting replaces the attachments on your previous review.
          </Text>
        )}
      </View>

      <TouchableOpacity
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.85}
        style={[s.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }]}
      >
        {submitting ? (
          <View style={s.submitInner}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={s.submitTxt}>
              {progress ? `Uploading ${progress.done}/${progress.total}…` : 'Submitting…'}
            </Text>
          </View>
        ) : (
          <Text style={s.submitTxt}>{isEditing ? 'Update review' : 'Submit review'}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 14 },
  section: { gap: 10 },
  label: { fontSize: 15, fontWeight: '600' },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ratingLabel: { fontSize: 15, fontWeight: '700' },
  input: { borderRadius: 12, borderWidth: 1, padding: 14, fontSize: 15, minHeight: 120 },
  hint: { fontSize: 12, lineHeight: 17 },
  submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  submitTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
