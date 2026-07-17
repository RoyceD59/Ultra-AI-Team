import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import ProductCard from '@/components/ProductCard';
import FilterChip from '@/components/FilterChip';

const CATEGORIES = ['All', 'Bottles & Portable', 'Home Filters', 'Shower & Skin', 'Accessories', 'Solutions'];
const topPad = Platform.OS === 'web' ? 67 : 0;

export default function ProductsScreen() {
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const { data: products, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['products', category, search],
    queryFn: () => api.getProducts({
      category: category === 'All' ? undefined : category,
      search: search || undefined,
    }),
    staleTime: 2 * 60 * 1000,
  });

  const numColumns = 2;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Search */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: topPad }]}>
        <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search filters, systems…"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {search.length > 0 && (
          <Ionicons name="close-circle" size={18} color={colors.mutedForeground} onPress={() => setSearch('')} />
        )}
      </View>

      {/* Category chips */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={i => i}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <FilterChip label={item} active={category === item} onPress={() => setCategory(item)} />
        )}
      />

      {/* Products grid */}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={products ?? []}
          key={`grid-${numColumns}`}
          numColumns={numColumns}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No products found</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ProductCard product={item} onPress={() => router.push(`/product/${item.id}` as never)} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  chips: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  grid: { padding: 12, paddingBottom: Platform.OS === 'web' ? 34 : 80 },
  row: { gap: 12, marginBottom: 12 },
  cardWrap: { flex: 1 },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 15 },
});
