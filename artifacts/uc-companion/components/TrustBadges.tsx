import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

/**
 * Certifications & patron badges shown on the home screen and product pages.
 *
 * Certifications (verified technical / regulatory):
 *   - Unilever Partner
 *   - WHO Compliant
 *   - Dermatologist Tested
 *   - ISO 9001 Certified
 *   - BPA Free
 *   - RoHS Certified
 *
 * Patrons (organisations that endorse / partner with UCFilters):
 *   - Ghana Olympics
 *   - Volunteers
 *   - Youth
 */

const BADGES: Array<{
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  section?: 'patron';
}> = [
  // ── Certifications ────────────────────────────────────────────────────────
  { label: 'Unilever\nPartner',         icon: 'ribbon-outline',            color: '#1B3A6B' },
  { label: 'WHO\nCompliant',            icon: 'shield-checkmark-outline',  color: '#006FB7' },
  { label: 'Dermatologist\nTested',     icon: 'medical-outline',           color: '#00857C' },
  { label: 'ISO 9001\nCertified',       icon: 'star-outline',              color: '#F4A100' },
  { label: 'BPA\nFree',                 icon: 'water-outline',             color: '#0097A7' },
  { label: 'RoHS\nCertified',           icon: 'leaf-outline',              color: '#43A047' },
  // ── Patrons ───────────────────────────────────────────────────────────────
  { label: 'Ghana\nOlympics',           icon: 'trophy-outline',            color: '#FFD700', section: 'patron' },
  { label: 'Volunteers\nNetwork',       icon: 'people-outline',            color: '#7B1FA2', section: 'patron' },
  { label: 'Youth\nAlliance',           icon: 'heart-outline',             color: '#E53935', section: 'patron' },
];

interface Props {
  compact?: boolean;
}

export default function TrustBadges({ compact = false }: Props) {
  const colors = useColors();

  return (
    <View style={styles.wrapper}>
      {/* Certifications row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {BADGES.filter(b => !b.section).map(b => (
          <View key={b.label}
            style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border },
              compact && styles.badgeCompact]}>
            <View style={[styles.iconWrap, { backgroundColor: b.color + '15' }]}>
              <Ionicons name={b.icon} size={compact ? 14 : 18} color={b.color} />
            </View>
            {!compact && (
              <Text style={[styles.label, { color: colors.text }]}>{b.label}</Text>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Patrons row */}
      {!compact && (
        <>
          <Text style={[styles.patronHeader, { color: colors.mutedForeground }]}>PATRONS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}>
            {BADGES.filter(b => b.section === 'patron').map(b => (
              <View key={b.label}
                style={[styles.badge, styles.patronBadge,
                  { backgroundColor: b.color + '12', borderColor: b.color + '40' }]}>
                <View style={[styles.iconWrap, { backgroundColor: b.color + '25' }]}>
                  <Ionicons name={b.icon} size={18} color={b.color} />
                </View>
                <Text style={[styles.label, { color: colors.text }]}>{b.label}</Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:      { gap: 8 },
  row:          { flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  badge:        { alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10, gap: 6, minWidth: 70 },
  badgeCompact: { padding: 6, minWidth: 40 },
  patronBadge:  { minWidth: 76 },
  iconWrap:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label:        { fontSize: 10, fontWeight: '600' as const, textAlign: 'center', lineHeight: 13 },
  patronHeader: { fontSize: 9, fontWeight: '700' as const, letterSpacing: 1, marginTop: 4, paddingLeft: 2 },
});
