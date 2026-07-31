import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, LayoutAnimation, UIManager,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { GUIDES, GuideSection } from '@/data/guides';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const topPad = Platform.OS === 'web' ? 67 : 0;

// ── Derive a sensible illustration icon from the section heading ──────────────
const HEADING_ICON_MAP: Array<[RegExp, string]> = [
  [/box|unbox|in the box|package|what.s include/i, 'cube-outline'],
  [/tool|equipment|require|need/i,                  'construct-outline'],
  [/install|fit|attach|connect|mount|setup|set up/i,'hammer-outline'],
  [/clean|wash|hygiene|disinfect/i,                 'sparkles-outline'],
  [/storage|store|shelf|keep/i,                     'archive-outline'],
  [/replac|swap|change|cartridge/i,                 'refresh-outline'],
  [/first use|before|priming|prime/i,               'hand-left-outline'],
  [/daily|every day|routine|use/i,                  'sunny-outline'],
  [/troubleshoot|problem|issue|fix|not work/i,      'build-outline'],
  [/tip|trick|best practice|advice/i,               'bulb-outline'],
  [/warning|caution|danger|avoid/i,                 'warning-outline'],
  [/switch|mode|toggle|divert/i,                    'git-branch-outline'],
  [/shower|bath/i,                                  'water-outline'],
  [/faucet|tap|kitchen/i,                           'home-outline'],
  [/flow|pressure|rate/i,                           'speedometer-outline'],
  [/leak|seal|o-ring|gasket/i,                      'shield-outline'],
  [/taste|smell|odour|color|colour|turbid/i,        'flask-outline'],
  [/contact|support|help|ticket/i,                  'headset-outline'],
  [/week|month|year|schedule|reminder/i,            'calendar-outline'],
];

function iconForHeading(heading: string, fallback: string): string {
  for (const [re, icon] of HEADING_ICON_MAP) {
    if (re.test(heading)) return icon;
  }
  return fallback;
}

// ── Illustration banner ───────────────────────────────────────────────────────
interface IllustrationProps {
  icon: string;
  accentColor: string;
  stepCount?: number;
}

function IllustrationBanner({ icon, accentColor, stepCount }: IllustrationProps) {
  return (
    <View style={[styles.illustration, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
      {/* Decorative circles */}
      <View style={[styles.illCircle1, { backgroundColor: accentColor + '18' }]} />
      <View style={[styles.illCircle2, { backgroundColor: accentColor + '10' }]} />

      {/* Main icon */}
      <View style={[styles.illIconWrap, { backgroundColor: accentColor + '22', borderColor: accentColor + '40' }]}>
        <Ionicons name={icon as never} size={36} color={accentColor} />
      </View>

      {/* Step count badge */}
      {stepCount != null && stepCount > 0 && (
        <View style={[styles.illBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.illBadgeText}>{stepCount} steps</Text>
        </View>
      )}
    </View>
  );
}

// ── Collapsible section card ──────────────────────────────────────────────────
interface SectionCardProps {
  section: GuideSection;
  index: number;
  guideIcon: string;
  accentColor: string;
  defaultOpen: boolean;
}

function SectionCard({ section, index, guideIcon, accentColor, defaultOpen }: SectionCardProps) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(o => !o);
  }, []);

  const illIcon = section.illustrationIcon ?? iconForHeading(section.heading, guideIcon);
  const hasContent = section.body || (section.steps && section.steps.length > 0)
    || section.tip || section.warning;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header row — always visible */}
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={styles.cardHeader}
      >
        {/* Section number */}
        <View style={[styles.sectionNum, { backgroundColor: accentColor + '18' }]}>
          <Text style={[styles.sectionNumText, { color: accentColor }]}>{index + 1}</Text>
        </View>

        {/* Heading + chevron */}
        <Text style={[styles.cardHeading, { color: colors.text }]} numberOfLines={open ? undefined : 2}>
          {section.heading}
        </Text>

        {hasContent && (
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.mutedForeground}
          />
        )}
      </TouchableOpacity>

      {/* Expandable body */}
      {open && hasContent && (
        <View style={styles.cardBody}>
          {/* Illustration banner */}
          <IllustrationBanner
            icon={illIcon}
            accentColor={accentColor}
            stepCount={section.steps?.length}
          />

          {section.body ? (
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{section.body}</Text>
          ) : null}

          {section.steps ? (
            <View style={styles.steps}>
              {section.steps.map((step, i) => (
                <View key={i} style={[styles.step, { borderColor: colors.border }]}>
                  <View style={[styles.stepNumber, { backgroundColor: accentColor }]}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {section.tip ? (
            <View style={[styles.callout, { backgroundColor: accentColor + '12', borderColor: accentColor + '40' }]}>
              <Ionicons name="bulb-outline" size={16} color={accentColor} style={{ marginTop: 2 }} />
              <Text style={[styles.calloutText, { color: colors.text }]}>{section.tip}</Text>
            </View>
          ) : null}

          {section.warning ? (
            <View style={[styles.callout, { backgroundColor: '#FFF3CD', borderColor: '#F59E0B' }]}>
              <Ionicons name="warning-outline" size={16} color="#D97706" style={{ marginTop: 2 }} />
              <Text style={[styles.calloutText, { color: '#92400E' }]}>{section.warning}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
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

  const accent = colors.primary;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, {
        backgroundColor: colors.card,
        borderBottomColor: colors.border,
        paddingTop: topPad + 12,
      }]}>
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
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: colors.primaryLight }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name={guide.icon as never} size={28} color="#fff" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>{guide.title}</Text>
          <Text style={[styles.heroProducts, { color: colors.mutedForeground }]}>{guide.products}</Text>
          <Text style={[styles.heroSummary, { color: colors.text }]}>{guide.summary}</Text>

          {/* Section count pill */}
          <View style={[styles.sectionCountPill, { backgroundColor: colors.primary + '20' }]}>
            <Ionicons name="list-outline" size={13} color={colors.primary} />
            <Text style={[styles.sectionCountText, { color: colors.primary }]}>
              {guide.sections.length} sections · tap to expand
            </Text>
          </View>
        </View>

        {/* Collapsible section cards */}
        {guide.sections.map((section, si) => (
          <SectionCard
            key={si}
            section={section}
            index={si}
            guideIcon={guide.icon}
            accentColor={accent}
            defaultOpen={si === 0}
          />
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

// ── Styles ────────────────────────────────────────────────────────────────────
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

  content:          { padding: 16, gap: 12 },

  hero:             { borderRadius: 16, padding: 20, gap: 10, alignItems: 'flex-start', marginBottom: 4 },
  heroIcon:         { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroTitle:        { fontSize: 20, fontWeight: '700' as const, lineHeight: 28 },
  heroProducts:     { fontSize: 12, fontWeight: '500' as const },
  heroSummary:      { fontSize: 14, lineHeight: 22, marginTop: 4 },
  sectionCountPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 6 },
  sectionCountText: { fontSize: 12, fontWeight: '600' as const },

  // Card
  card:             { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sectionNum:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sectionNumText:   { fontSize: 13, fontWeight: '700' as const },
  cardHeading:      { flex: 1, fontSize: 15, fontWeight: '700' as const, lineHeight: 21 },
  cardBody:         { padding: 14, paddingTop: 0, gap: 14 },

  // Illustration
  illustration:     { borderRadius: 12, borderWidth: 1, height: 110, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  illCircle1:       { position: 'absolute', width: 120, height: 120, borderRadius: 60, top: -30, right: -20 },
  illCircle2:       { position: 'absolute', width: 80, height: 80, borderRadius: 40, bottom: -20, left: 10 },
  illIconWrap:      { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  illBadge:         { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  illBadgeText:     { color: '#fff', fontSize: 10, fontWeight: '700' as const },

  body:             { fontSize: 14, lineHeight: 22 },
  steps:            { gap: 10 },
  step:             { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stepNumber:       { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  stepNumberText:   { color: '#fff', fontSize: 12, fontWeight: '700' as const },
  stepText:         { flex: 1, fontSize: 14, lineHeight: 22 },

  callout:          { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  calloutText:      { flex: 1, fontSize: 13, lineHeight: 20 },

  footer:           { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 4 },
  footerTitle:      { fontSize: 14, fontWeight: '700' as const },
  footerSub:        { fontSize: 12, marginTop: 2 },
  footerBtn:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  footerBtnText:    { color: '#fff', fontSize: 13, fontWeight: '600' as const },
});
