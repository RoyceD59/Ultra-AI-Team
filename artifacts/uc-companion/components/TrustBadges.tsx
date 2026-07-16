import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const BADGES = [
  { label: 'Unilever\nPartner', icon: 'ribbon-outline' as const, color: '#1B3A6B' },
  { label: 'WHO\nCompliant', icon: 'shield-checkmark-outline' as const, color: '#006FB7' },
  { label: 'KEBS\nApproved', icon: 'checkmark-circle-outline' as const, color: '#C8102E' },
  { label: 'Dermatologist\nTested', icon: 'medical-outline' as const, color: '#00857C' },
  { label: 'ISO 9001\nCertified', icon: 'star-outline' as const, color: '#F4A100' },
];

interface Props {
  compact?: boolean;
}

export default function TrustBadges({ compact = false }: Props) {
  const colors = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {BADGES.map(b => (
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  badge: { alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10, gap: 6, minWidth: 70 },
  badgeCompact: { padding: 6, minWidth: 40 },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '600' as const, textAlign: 'center', lineHeight: 13 },
});
