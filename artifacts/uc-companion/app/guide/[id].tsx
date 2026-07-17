import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GUIDES } from '@/data/guides';

const topPad = Platform.OS === 'web' ? 67 : 0;

export default function GuideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const colors  = useColors();

  const guide = GUIDES.find(g => g.id === id);

  if (!guide) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.notFound}>
          <Ionicons name="document-outline" size={40} color={colors.border} />
          <Text style={[styles.notFoundText, { color: colors.text }]}>Guide not found</Text>
          <TouchableOpacity onPress={() => router.back()}
            style={[styles.backBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={[styles.categoryPill, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.categoryPillText, { color: colors.primary }]}>{guide.category}</Text>
          </View>
        </View>
        <Text style={[styles.readTime, { color: colors.mutedForeground }]}>{guide.readTime}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === 'web' ? 40 : 80 }]}
        showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primaryLight }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name={guide.icon as never} size={28} color="#fff" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{guide.title}</Text>
          <Text style={[styles.heroProducts, { color: colors.mutedForeground }]}>{guide.products}</Text>
          <Text style={[styles.heroSummary, { color: colors.text }]}>{guide.summary}</Text>
        </View>

        {/* Sections */}
        {guide.sections.map((section, si) => (
          <View key={si} style={styles.section}>
            <Text style={[styles.sectionHeading, { color: colors.text }]}>{section.heading}</Text>

            {section.body ? (
              <Text style={[styles.body, { color: colors.mutedForeground }]}>{section.body}</Text>
            ) : null}

            {section.steps ? (
              <View style={styles.steps}>
                {section.steps.map((step, i) => (
                  <View key={i} style={styles.step}>
                    <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                      <Text style={styles.stepNumberText}>{i + 1}</Text>
                    </View>
                    <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {section.tip ? (
              <View style={[styles.callout, styles.calloutTip, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '40' }]}>
                <Ionicons name="bulb-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                <Text style={[styles.calloutText, { color: colors.text }]}>{section.tip}</Text>
              </View>
            ) : null}

            {section.warning ? (
              <View style={[styles.callout, styles.calloutWarn, { backgroundColor: '#FFF3CD', borderColor: '#F59E0B' }]}>
                <Ionicons name="warning-outline" size={16} color="#D97706" style={{ marginTop: 2 }} />
                <Text style={[styles.calloutText, { color: '#92400E' }]}>{section.warning}</Text>
              </View>
            ) : null}
          </View>
        ))}

        {/* Footer CTA */}
        <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="headset-outline" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.footerTitle, { color: colors.text }]}>Still need help?</Text>
            <Text style={[styles.footerSub, { color: colors.mutedForeground }]}>
              Submit a ticket or call +254 700 000 000
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/ticket/new' as never)}
            style={[styles.footerBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.footerBtnText}>Get Help</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:           { flex: 1 },
  notFound:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  notFoundText:     { fontSize: 16, fontWeight: '600' as const },
  backBtn:          { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  backBtnText:      { color: '#fff', fontWeight: '600' as const },

  header:           { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerBack:       { padding: 4 },
  categoryPill:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  categoryPillText: { fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase', letterSpacing: 0.5 },
  readTime:         { fontSize: 12 },

  content:          { padding: 16, gap: 24 },

  hero:             { borderRadius: 16, padding: 20, gap: 10, alignItems: 'flex-start' },
  heroIcon:         { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle:        { fontSize: 20, fontWeight: '700' as const, lineHeight: 28 },
  heroProducts:     { fontSize: 12, fontWeight: '500' as const },
  heroSummary:      { fontSize: 14, lineHeight: 22, marginTop: 4 },

  section:          { gap: 10 },
  sectionHeading:   { fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
  body:             { fontSize: 14, lineHeight: 22 },

  steps:            { gap: 12 },
  step:             { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNumber:       { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNumberText:   { color: '#fff', fontSize: 12, fontWeight: '700' as const },
  stepText:         { flex: 1, fontSize: 14, lineHeight: 22 },

  callout:          { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  calloutTip:       {},
  calloutWarn:      {},
  calloutText:      { flex: 1, fontSize: 13, lineHeight: 20 },

  footer:           { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 16 },
  footerTitle:      { fontSize: 14, fontWeight: '700' as const },
  footerSub:        { fontSize: 12, marginTop: 2 },
  footerBtn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  footerBtnText:    { color: '#fff', fontSize: 13, fontWeight: '600' as const },
});
