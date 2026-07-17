import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Switch, Platform, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import {
  getNotifPrefs,
  saveNotifPrefs,
  cancelAllFilterNotifications,
  scheduleAllFilterNotifications,
  getFilterActivation,
  type NotifPrefs,
} from '@/hooks/useNotifications';
import * as Haptics from 'expo-haptics';

export default function NotificationPreferencesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const api = useApi();

  const [prefs, setPrefs] = useState<NotifPrefs>({ orderUpdates: true, filterReminders: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotifPrefs().then(setPrefs);
  }, []);

  const handleToggle = useCallback(async (key: keyof NotifPrefs, value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated: NotifPrefs = { ...prefs, [key]: value };
    setPrefs(updated);
    setSaving(true);

    try {
      // Persist client-side preference
      await saveNotifPrefs(updated);

      if (key === 'filterReminders') {
        if (!value) {
          // Cancel all scheduled local filter notifications
          await cancelAllFilterNotifications();
        } else {
          // Reschedule if there's an active filter
          const activation = await getFilterActivation();
          if (activation) {
            await scheduleAllFilterNotifications(activation);
          }
        }
      }

      if (key === 'orderUpdates' && token) {
        // Sync opt-out to server so server-side pushes also respect the pref
        await api.updatePushPrefs({ optOutOrders: !value }).catch(() => {});
      }
    } finally {
      setSaving(false);
    }
  }, [prefs, token, api]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[styles.header, { borderColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Notification Preferences</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Choose which notifications you receive. You can change these at any time.
        </Text>

        {/* Toggle card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <PrefRow
            icon="bag-outline"
            iconColor={colors.primary}
            iconBg={colors.primaryLight}
            title="Order updates"
            description="Confirmation and status updates when you place an order"
            value={prefs.orderUpdates}
            onToggle={v => handleToggle('orderUpdates', v)}
            disabled={saving}
            colors={colors}
          />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <PrefRow
            icon="water-outline"
            iconColor="#00B4D8"
            iconBg="#E0F7FC"
            title="Filter replacement reminders"
            description="Lifecycle alerts at 30 days, 60 days, and before your filter expires"
            value={prefs.filterReminders}
            onToggle={v => handleToggle('filterReminders', v)}
            disabled={saving || Platform.OS === 'web'}
            colors={colors}
            webNote={Platform.OS === 'web' ? 'Local notifications are only available in the mobile app' : undefined}
          />
        </View>

        {/* Info box */}
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
            Turning off a category stops future notifications of that type. You can re-enable at any time — filter reminders will be rescheduled automatically.
          </Text>
        </View>

        {/* System settings note */}
        <Text style={[styles.systemNote, { color: colors.mutedForeground }]}>
          To disable all notifications from Ultra Clear, use your device's Settings → Notifications.
        </Text>
      </ScrollView>
    </View>
  );
}

function PrefRow({
  icon, iconColor, iconBg, title, description, value, onToggle, disabled, colors, webNote,
}: {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
  webNote?: string;
}) {
  return (
    <View style={styles.prefRow}>
      <View style={[styles.prefIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as never} size={20} color={iconColor} />
      </View>
      <View style={styles.prefText}>
        <Text style={[styles.prefTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.prefDesc, { color: colors.mutedForeground }]}>
          {webNote ?? description}
        </Text>
      </View>
      <Switch
        value={disabled && webNote ? false : value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? (value ? '#fff' : '#f4f3f4') : undefined}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' as const },
  scroll: { padding: 20, gap: 16, paddingBottom: 48 },
  intro: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  prefIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  prefText: { flex: 1, gap: 2 },
  prefTitle: { fontSize: 15, fontWeight: '600' as const },
  prefDesc: { fontSize: 13, lineHeight: 18 },
  divider: { height: 1, marginHorizontal: 16 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 14,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  systemNote: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 8 },
});
