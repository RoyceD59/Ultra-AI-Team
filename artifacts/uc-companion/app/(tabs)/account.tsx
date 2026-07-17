import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import OrderCard from '@/components/OrderCard';
import FilterTrackerSection from '@/components/FilterTrackerSection';
import * as Haptics from 'expo-haptics';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  getFilterActivation,
  type FilterActivation,
} from '@/hooks/useNotifications';
const topPad = Platform.OS === 'web' ? 67 : 0;

const MENU_ITEMS = [
  { label: 'My Orders', icon: 'bag-outline' as const, route: '/account' },
  { label: 'Refer & Earn', icon: 'gift-outline' as const, route: '/referral' },
  { label: 'Maintenance Tickets', icon: 'construct-outline' as const, route: '/ticket/new' },
  { label: 'Water Test History', icon: 'flask-outline' as const, route: '/water-test' },
  { label: 'Notification Preferences', icon: 'notifications-outline' as const, route: '/notification-preferences' },
  { label: 'Help & Support', icon: 'help-circle-outline' as const, route: '/(tabs)/support' },
];

export default function AccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user, logout } = useAuth();
  const api = useApi();
  const [notifStatus, setNotifStatus]           = useState<string>('undetermined');
  const [filterActivation, setFilterActivation] = useState<FilterActivation | null>(null);

  const refreshNotifStatus = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const s = await getNotificationPermissionStatus();
    setNotifStatus(s);
  }, []);

  useEffect(() => {
    refreshNotifStatus();
    getFilterActivation().then(setFilterActivation);
  }, [refreshNotifStatus]);

  async function enableNotifications() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const granted = await requestNotificationPermission();
    setNotifStatus(granted ? 'granted' : 'denied');
  }

  const { data: orders } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.getOrders(),
    enabled: !!user,
  });

  if (!user) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.guestContainer, { marginTop: topPad }]}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="person-outline" size={40} color={colors.primary} />
          </View>
          <Text style={[styles.guestTitle, { color: colors.text }]}>Sign in to your account</Text>
          <Text style={[styles.guestSub, { color: colors.mutedForeground }]}>
            Access order history, manage your filters, and get personalised recommendations
          </Text>
          <TouchableOpacity onPress={() => router.push('/auth/login')}
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.loginBtnText}>Sign In</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/auth/register')} style={styles.registerLink}>
            <Text style={[styles.registerLinkText, { color: colors.primary }]}>Create an account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
  const recentOrders = orders?.slice(0, 3) ?? [];

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 34 : 80 }}>

      {/* Notification permission prompt — shown until granted */}
      {Platform.OS !== 'web' && notifStatus !== 'granted' && (
        <View style={[styles.notifCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <View style={[styles.notifIconWrap, { backgroundColor: colors.primary }]}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.notifTitle, { color: colors.text }]}>Stay informed</Text>
            <Text style={[styles.notifSub, { color: colors.mutedForeground }]}>
              Get order updates and filter replacement reminders
            </Text>
          </View>
          {notifStatus === 'denied' ? (
            <Text style={[styles.notifDenied, { color: colors.mutedForeground }]}>
              Enable in Settings
            </Text>
          ) : (
            <TouchableOpacity onPress={enableNotifications}
              style={[styles.notifBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.notifBtnTxt}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Profile header */}
      <View style={[styles.profileHeader, { backgroundColor: colors.primary, paddingTop: topPad + 16 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{user.firstName} {user.lastName}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
          {!!user.phone && (
            <View style={styles.profilePhoneRow}>
              <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.7)" />
              <Text style={styles.profilePhone}>{user.phone}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {/* Filter tracker */}
        <FilterTrackerSection
          activation={filterActivation}
          onActivationChange={a => {
            setFilterActivation(a);
            // Refresh permission status in case user just granted it
            refreshNotifStatus();
          }}
        />

        {/* Recent orders */}
        {recentOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Orders</Text>
            <View style={{ gap: 10 }}>
              {recentOrders.map(order => (
                <OrderCard key={order.id} order={order}
                  onPress={() => router.push(`/order/${order.id}` as never)} />
              ))}
            </View>
          </View>
        )}

        {/* Menu */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>My Account</Text>
          <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {MENU_ITEMS.map((item, i) => (
              <TouchableOpacity key={item.label}
                onPress={() => router.push(item.route as never)}
                activeOpacity={0.75}
                style={[styles.menuItem, i < MENU_ITEMS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.menuIcon, { backgroundColor: colors.surface }]}>
                  <Ionicons name={item.icon} size={18} color={colors.primary} />
                </View>
                <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await logout();
        }} style={[styles.logoutBtn, { borderColor: colors.destructive }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
          <Text style={[styles.logoutText, { color: colors.destructive }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  guestContainer: { flex: 1, alignItems: 'center', padding: 40, gap: 16 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  guestTitle: { fontSize: 22, fontWeight: '700' as const, textAlign: 'center' },
  guestSub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  loginBtn: { paddingVertical: 14, paddingHorizontal: 48, borderRadius: 12, marginTop: 8 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  registerLink: { padding: 8 },
  registerLinkText: { fontSize: 15, fontWeight: '500' as const },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingBottom: 24 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' as const },
  profileName: { color: '#fff', fontSize: 18, fontWeight: '700' as const },
  profileEmail: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  profilePhoneRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 3 },
  profilePhone: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  body: { padding: 16, gap: 20 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const },
  menuCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500' as const },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14 },
  logoutText: { fontSize: 15, fontWeight: '600' as const },
  notifCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: topPad + 12, marginHorizontal: 16 },
  notifIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 14, fontWeight: '600' as const },
  notifSub: { fontSize: 12, marginTop: 2 },
  notifBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  notifBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '600' as const },
  notifDenied: { fontSize: 11, maxWidth: 72, textAlign: 'center' },
});
