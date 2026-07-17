import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import TicketCard from '@/components/TicketCard';

const GUIDES = [
  { id: '1',  title: 'Getting started with your filter bottle', product: 'Hydra Flux · Truva Go · Viva Drop', icon: 'document-text-outline' as const, time: '5 min read' },
  { id: '2',  title: 'How to replace your bottle filter cartridge', product: 'All Bottle Filters', icon: 'refresh-outline' as const, time: '3 min read' },
  { id: '3',  title: 'Sweet Home Faucet Filter — installation guide', product: 'Sweet Home', icon: 'home-outline' as const, time: '5 min read' },
  { id: '4',  title: 'Shower filter installation & cartridge swap', product: "J'adore · Derma Care · Pure Drop", icon: 'sparkles-outline' as const, time: '4 min read' },
  { id: '5',  title: 'Survivor Straw — field use & cleaning guide', product: 'Survivor Straw', icon: 'funnel-outline' as const, time: '4 min read' },
  { id: '6',  title: 'Counter Reverse Osmosis — setup & first use', product: 'Counter Reverse Osmosis', icon: 'layers-outline' as const, time: '8 min read' },
  { id: '7',  title: 'Troubleshooting: Slow flow or unusual taste', product: 'All Filters', icon: 'warning-outline' as const, time: '3 min read' },
  { id: '8',  title: 'Annual filter maintenance checklist', product: 'All Products', icon: 'checkbox-outline' as const, time: '6 min read' },
  { id: '9',  title: 'How to test your water quality at home', product: 'All Products', icon: 'flask-outline' as const, time: '5 min read' },
  { id: '10', title: 'EcoSmart Elite — solar charging & pump care', product: 'EcoSmart Elite', icon: 'flash-outline' as const, time: '6 min read' },
];

const TABS = ['Guides', 'My Tickets', 'Water Test'];
const topPad = Platform.OS === 'web' ? 67 : 0;

// ─── AI banner shown at top of Guides tab ─────────────────────────────────────
function AiBanner({ onPress, colors }: { onPress: () => void; colors: ReturnType<typeof import('@/hooks/useColors').useColors> }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[aiBannerStyles.wrap, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '40' }]}>
      <View style={[aiBannerStyles.iconWrap, { backgroundColor: colors.primary }]}>
        <Ionicons name="water" size={18} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[aiBannerStyles.title, { color: colors.text }]}>Ask AI — Water Assistant</Text>
        <Text style={[aiBannerStyles.sub, { color: colors.mutedForeground }]}>
          Get instant answers about your filter, water quality, and Nairobi water
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
    </TouchableOpacity>
  );
}

const aiBannerStyles = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 14, borderWidth: 1, padding: 14 },
  iconWrap:{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 14, fontWeight: '700' as const },
  sub:     { fontSize: 12, marginTop: 2, lineHeight: 17 },
});

export default function SupportScreen() {
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');

  const { data: tickets, isLoading: loadingTickets } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => api.getTickets(),
    enabled: tab === 1,
  });

  const filtered = GUIDES.filter(g =>
    g.title.toLowerCase().includes(search.toLowerCase()) ||
    g.product.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: topPad }]}>
        {TABS.map((t, i) => (
          <TouchableOpacity key={t} onPress={() => setTab(i)} activeOpacity={0.8}
            style={[styles.tab, tab === i && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
            <Text style={[styles.tabText, { color: tab === i ? colors.primary : colors.mutedForeground }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Guides */}
      {tab === 0 && (
        <>
          <AiBanner colors={colors} onPress={() => router.push('/ai-chat' as never)} />
          <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={16} color={colors.mutedForeground} />
            <TextInput value={search} onChangeText={setSearch}
              placeholder="Search guides…" placeholderTextColor={colors.mutedForeground}
              style={[styles.searchInput, { color: colors.text }]} />
          </View>
          <FlatList data={filtered} keyExtractor={g => g.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity activeOpacity={0.8}
                style={[styles.guideCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.guideIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name={item.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.guideTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.guideSub, { color: colors.mutedForeground }]}>{item.product} · {item.time}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.border} />
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {/* Tickets */}
      {tab === 1 && (
        <View style={{ flex: 1 }}>
          <FlatList data={tickets ?? []} keyExtractor={t => t.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <TouchableOpacity onPress={() => router.push('/ticket/new')}
                style={[styles.newTicketBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={styles.newTicketText}>New Maintenance Ticket</Text>
              </TouchableOpacity>
            }
            ListEmptyComponent={
              loadingTickets ? null : (
                <View style={styles.empty}>
                  <Ionicons name="construct-outline" size={40} color={colors.border} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No tickets yet</Text>
                  <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>Submit a ticket when you need service</Text>
                </View>
              )
            }
            renderItem={({ item }) => <TicketCard ticket={item} />}
          />
        </View>
      )}

      {/* Water Test */}
      {tab === 2 && (
        <ScrollView contentContainerStyle={styles.waterTestContent}>
          <View style={[styles.waterTestCard, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
            <Ionicons name="flask" size={40} color={colors.primary} />
            <Text style={[styles.waterTestTitle, { color: colors.text }]}>Free Water Quality Test</Text>
            <Text style={[styles.waterTestDesc, { color: colors.mutedForeground }]}>
              Book a free water quality assessment at your home or office. Our certified technician will test for contaminants, pH, hardness, and recommend the right filtration system.
            </Text>
            <TouchableOpacity onPress={() => router.push('/water-test')}
              style={[styles.waterTestBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.waterTestBtnText}>Book a Water Test</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.waterFeatures}>
            {['Free assessment', 'Certified technician', 'Same-week scheduling', 'Written report included'].map(f => (
              <View key={f} style={styles.waterFeature}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[styles.waterFeatureText, { color: colors.text }]}>{f}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 0 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' as const },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14 },
  list: { padding: 16, gap: 10, paddingBottom: Platform.OS === 'web' ? 34 : 80 },
  guideCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14 },
  guideIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  guideTitle: { fontSize: 14, fontWeight: '600' as const },
  guideSub: { fontSize: 12, marginTop: 2 },
  newTicketBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, marginBottom: 16 },
  newTicketText: { color: '#fff', fontSize: 15, fontWeight: '600' as const },
  empty: { alignItems: 'center', marginTop: 40, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '600' as const },
  emptySub: { fontSize: 14, textAlign: 'center' },
  waterTestContent: { padding: 20, gap: 20, paddingBottom: Platform.OS === 'web' ? 34 : 80 },
  waterTestCard: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: 'center', gap: 12 },
  waterTestTitle: { fontSize: 20, fontWeight: '700' as const, textAlign: 'center' },
  waterTestDesc: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  waterTestBtn: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  waterTestBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' as const },
  waterFeatures: { gap: 12 },
  waterFeature: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  waterFeatureText: { fontSize: 15, fontWeight: '500' as const },
});
