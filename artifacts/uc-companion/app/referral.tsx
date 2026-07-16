import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Share, Alert, ActivityIndicator, Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useApi, type UCPromotion } from '@/hooks/useApi';

const UC_SKY    = '#52b6dc';
const UC_DEEP   = '#005d8f';

function PromoCard({ promo }: { promo: UCPromotion }) {
  const colors = useColors();
  const expiry = new Date(promo.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View style={[styles.promoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.promoDiscount, { backgroundColor: UC_SKY + '22' }]}>
        <Text style={[styles.promoDiscountText, { color: UC_DEEP }]}>{promo.discountPercent}%{'\n'}OFF</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.promoTitle, { color: colors.text }]}>{promo.title}</Text>
        <Text style={[styles.promoDesc, { color: colors.mutedForeground }]} numberOfLines={2}>{promo.description}</Text>
        <View style={[styles.promoCodePill, { backgroundColor: UC_DEEP + '12' }]}>
          <Text style={[styles.promoCodeText, { color: UC_DEEP }]}>{promo.code}</Text>
        </View>
        <Text style={[styles.promoExpiry, { color: colors.mutedForeground }]}>Expires {expiry}</Text>
      </View>
    </View>
  );
}

export default function ReferralScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const api = useApi();
  const topPad = Platform.OS === 'web' ? 67 : 0;

  const { data: referral, isLoading: refLoading } = useQuery({
    queryKey: ['referral-code'],
    queryFn: () => api.getMyReferral(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: promotions, isLoading: promoLoading } = useQuery({
    queryKey: ['promotions'],
    queryFn: () => api.getPromotions(),
    staleTime: 2 * 60_000,
  });

  const handleCopy = useCallback(async () => {
    if (!referral?.code) return;
    await Clipboard.setStringAsync(referral.code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', `Code ${referral.code} copied to clipboard.`);
  }, [referral?.code]);

  const handleShare = useCallback(async () => {
    if (!referral) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: referral.shareMessage,
        title: 'Earn with Ultra Clear',
      });
    } catch { /* user dismissed */ }
  }, [referral]);

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="person-circle-outline" size={60} color={colors.mutedForeground} />
        <Text style={[styles.guestTitle, { color: colors.text }]}>Sign in to refer friends</Text>
        <TouchableOpacity onPress={() => router.push('/auth/login')}
          style={[styles.btn, { backgroundColor: UC_DEEP }]}>
          <Text style={styles.btnText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : 80 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Deep Ocean Blue hero header */}
      <View style={[styles.hero, { paddingTop: topPad + 20 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.heroIcon}>
          <Ionicons name="gift" size={32} color={UC_DEEP} />
        </View>
        <Text style={styles.heroTitle}>Refer & Earn</Text>
        <Text style={styles.heroSub}>
          Share your code — your friend gets 10% off their first order.{'\n'}You earn KES 200 store credit per conversion.
        </Text>
      </View>

      <View style={styles.body}>
        {/* Referral code card */}
        {refLoading ? (
          <ActivityIndicator color={UC_DEEP} style={{ marginVertical: 24 }} />
        ) : referral ? (
          <View style={[styles.codeCard, { backgroundColor: colors.card, borderColor: UC_SKY }]}>
            <Text style={[styles.codeLabel, { color: colors.mutedForeground }]}>YOUR REFERRAL CODE</Text>
            <Text style={[styles.codeValue, { color: UC_DEEP }]}>{referral.code}</Text>
            <View style={styles.codeActions}>
              <TouchableOpacity onPress={handleCopy}
                style={[styles.codeBtn, { backgroundColor: UC_DEEP + '12', borderColor: UC_DEEP }]}>
                <Ionicons name="copy-outline" size={16} color={UC_DEEP} />
                <Text style={[styles.codeBtnText, { color: UC_DEEP }]}>Copy Code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare}
                style={[styles.codeBtn, { backgroundColor: UC_DEEP, borderColor: UC_DEEP }]}>
                <Ionicons name="share-social-outline" size={16} color="#fff" />
                <Text style={[styles.codeBtnText, { color: '#fff' }]}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Stats row */}
        {referral && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statNum, { color: UC_DEEP }]}>{referral.referredCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Friends Invited</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statNum, { color: UC_DEEP }]}>{referral.conversions}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Purchases Made</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: UC_DEEP, borderColor: UC_DEEP }]}>
              <Text style={[styles.statNum, { color: '#fff' }]}>KES {referral.creditsEarnedKes.toLocaleString()}</Text>
              <Text style={[styles.statLabel, { color: 'rgba(255,255,255,0.75)' }]}>Credits Earned</Text>
            </View>
          </View>
        )}

        {/* How it works */}
        <View style={[styles.howCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>How it works</Text>
          {[
            { icon: 'share-social-outline' as const, text: 'Share your unique code with friends and family' },
            { icon: 'person-add-outline' as const, text: 'They enter your code when they register or at checkout' },
            { icon: 'pricetag-outline' as const, text: 'They get 10% off their first order' },
            { icon: 'wallet-outline' as const, text: 'You earn KES 200 credit when they complete a purchase' },
          ].map((step, i) => (
            <View key={i} style={styles.howStep}>
              <View style={[styles.howIcon, { backgroundColor: UC_SKY + '22' }]}>
                <Ionicons name={step.icon} size={18} color={UC_DEEP} />
              </View>
              <Text style={[styles.howText, { color: colors.text }]}>{step.text}</Text>
            </View>
          ))}
        </View>

        {/* Active Promotions */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Active Promotions</Text>
        {promoLoading ? (
          <ActivityIndicator color={UC_DEEP} />
        ) : promotions && promotions.length > 0 ? (
          <View style={{ gap: 10 }}>
            {promotions.map(p => <PromoCard key={p.id} promo={p} />)}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No active promotions right now. Check back soon!</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  guestTitle: { fontSize: 20, fontWeight: '700' as const, textAlign: 'center' },
  btn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  hero: {
    backgroundColor: UC_DEEP, paddingHorizontal: 24, paddingBottom: 32,
    alignItems: 'center', gap: 10,
  },
  backBtn: { position: 'absolute', top: 16, left: 16, padding: 8 },
  heroIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    marginTop: 12,
  },
  heroTitle: { fontSize: 26, fontWeight: '800' as const, color: '#fff' },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.80)', textAlign: 'center', lineHeight: 20 },
  body: { padding: 16, gap: 20 },
  codeCard: {
    borderRadius: 16, borderWidth: 2, padding: 20,
    alignItems: 'center', gap: 12,
  },
  codeLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1.5 },
  codeValue: { fontSize: 34, fontWeight: '900' as const, letterSpacing: 4 },
  codeActions: { flexDirection: 'row', gap: 10, width: '100%' },
  codeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, borderRadius: 10, paddingVertical: 12,
  },
  codeBtnText: { fontSize: 14, fontWeight: '600' as const },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
  },
  statNum: { fontSize: 20, fontWeight: '800' as const },
  statLabel: { fontSize: 11, fontWeight: '500' as const, textAlign: 'center' },
  howCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const },
  howStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  howIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  howText: { flex: 1, fontSize: 14, lineHeight: 20 },
  promoCard: {
    borderRadius: 14, borderWidth: 1, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  promoDiscount: {
    width: 56, height: 56, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  promoDiscountText: { fontSize: 12, fontWeight: '800' as const, textAlign: 'center', lineHeight: 14 },
  promoTitle: { fontSize: 15, fontWeight: '700' as const },
  promoDesc: { fontSize: 13, lineHeight: 18 },
  promoCodePill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  promoCodeText: { fontSize: 12, fontWeight: '700' as const, letterSpacing: 1 },
  promoExpiry: { fontSize: 11 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 12 },
});
