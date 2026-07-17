import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useApi } from '@/hooks/useApi';
import { useCart } from '@/context/CartContext';
import TrustBadges from '@/components/TrustBadges';
import * as Haptics from 'expo-haptics';

function formatKES(price: string) {
  const n = parseFloat(price);
  return isNaN(n) ? '—' : `KES ${n.toLocaleString('en-KE')}`;
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const router = useRouter();
  const api = useApi();
  const { addItem, totalItems } = useCart();

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.getProduct(parseInt(id!)),
    enabled: !!id,
  });

  if (isLoading) return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );

  if (!product) return (
    <View style={[styles.loading, { backgroundColor: colors.background }]}>
      <Text style={{ color: colors.mutedForeground }}>Product not found</Text>
    </View>
  );

  const isEnquiryOnly = product.enquiryOnly === true;
  const displayPrice = product.salePrice || product.price || product.regularPrice;
  const isOnSale = !isEnquiryOnly && product.salePrice && parseFloat(product.salePrice) < parseFloat(product.regularPrice);
  const inStock = product.stockStatus === 'instock';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Image */}
        <View style={[styles.imageContainer, { backgroundColor: colors.surface }]}>
          {product.images[0] ? (
            <Image source={{ uri: product.images[0].src }} style={styles.image} resizeMode="contain" />
          ) : (
            <Ionicons name="water-outline" size={80} color={colors.primary} />
          )}
          {isOnSale && (
            <View style={[styles.saleBadge, { backgroundColor: colors.destructive }]}>
              <Text style={styles.saleBadgeText}>SALE</Text>
            </View>
          )}
        </View>

        <View style={styles.body}>
          {/* Category */}
          <Text style={[styles.category, { color: colors.accent }]}>
            {product.categories[0]?.name ?? ''}
          </Text>

          {/* Name & Price */}
          <Text style={[styles.name, { color: colors.text }]}>{product.name}</Text>
          <Text style={[styles.sku, { color: colors.mutedForeground }]}>SKU: {product.sku}</Text>

          {isEnquiryOnly
            ? <View style={[styles.enquiryBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.enquiryBannerTitle, { color: colors.primary }]}>Pricing on request</Text>
                  <Text style={[styles.enquiryBannerSub, { color: colors.mutedForeground }]}>
                    Contact us for a personalised quote — usually within 24 hours.
                  </Text>
                </View>
              </View>
            : <>
                <View style={styles.priceRow}>
                  <Text style={[styles.price, { color: colors.primary }]}>{formatKES(displayPrice)}</Text>
                  {isOnSale && (
                    <Text style={[styles.oldPrice, { color: colors.mutedForeground }]}>{formatKES(product.regularPrice)}</Text>
                  )}
                  <View style={[styles.stockBadge, { backgroundColor: inStock ? colors.successLight : '#FFF0F0' }]}>
                    <Ionicons name={inStock ? 'checkmark-circle-outline' : 'close-circle-outline'} size={13}
                      color={inStock ? colors.success : colors.destructive} />
                    <Text style={[styles.stockText, { color: inStock ? colors.success : colors.destructive }]}>
                      {inStock ? 'In Stock' : 'Out of Stock'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.matchBadge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
                  <Text style={[styles.matchText, { color: colors.primary }]}>Prices match our website — guaranteed</Text>
                </View>
              </>
          }

          {/* Description */}
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Product Details</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {product.description.replace(/<[^>]*>/g, '')}
          </Text>

          {/* Short description */}
          {product.shortDescription && (
            <Text style={[styles.shortDesc, { color: colors.mutedForeground }]}>
              {product.shortDescription.replace(/<[^>]*>/g, '')}
            </Text>
          )}

          {/* Trust Badges */}
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Certifications & Trust</Text>
          <TrustBadges />
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderColor: colors.border }]}>
        {isEnquiryOnly ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(`/enquiry?productId=${product.id}&productName=${encodeURIComponent(product.name)}`);
            }}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            <Text style={[styles.addBtnText, { color: '#fff' }]}>Enquire About This Product</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity onPress={() => router.push('/cart')} activeOpacity={0.8}
              style={[styles.cartIcon, { borderColor: colors.border }]}>
              <Ionicons name="cart-outline" size={22} color={colors.primary} />
              {totalItems > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{totalItems}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              disabled={!inStock}
              onPress={() => {
                if (!inStock) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                addItem({ id: product.id, name: product.name, price: parseFloat(displayPrice), quantity: 1, image: product.images[0]?.src ?? '', sku: product.sku });
                router.push('/cart');
              }}
              style={[styles.addBtn, { backgroundColor: inStock ? colors.primary : colors.muted }]}>
              <Ionicons name="cart-outline" size={20} color={inStock ? '#fff' : colors.mutedForeground} />
              <Text style={[styles.addBtnText, { color: inStock ? '#fff' : colors.mutedForeground }]}>
                {inStock ? 'Add to Cart' : 'Out of Stock'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageContainer: { height: 260, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  saleBadge: { position: 'absolute', top: 16, left: 16, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  saleBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' as const },
  body: { padding: 20, gap: 14 },
  category: { fontSize: 12, fontWeight: '700' as const, textTransform: 'uppercase', letterSpacing: 1 },
  name: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  sku: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  price: { fontSize: 26, fontWeight: '800' as const },
  oldPrice: { fontSize: 16, textDecorationLine: 'line-through' },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  stockText: { fontSize: 12, fontWeight: '600' as const },
  matchBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  matchText: { fontSize: 13, fontWeight: '500' as const },
  sectionLabel: { fontSize: 16, fontWeight: '700' as const, marginTop: 4 },
  description: { fontSize: 14, lineHeight: 22 },
  shortDesc: { fontSize: 14, lineHeight: 22, fontStyle: 'italic' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, padding: 16, paddingBottom: Platform.OS === 'web' ? 34 : 16, borderTopWidth: 1 },
  cartIcon: { width: 50, height: 50, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  addBtnText: { fontSize: 16, fontWeight: '700' as const },
  enquiryBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  enquiryBannerTitle: { fontSize: 15, fontWeight: '700' as const },
  enquiryBannerSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
