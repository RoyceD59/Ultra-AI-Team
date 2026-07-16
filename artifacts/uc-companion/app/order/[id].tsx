import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

const STATUS_CONFIG: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; desc: string }> = {
  pending: { label: 'Order Placed', icon: 'time-outline', color: '#F59E0B', desc: 'Your order has been received and is awaiting payment confirmation.' },
  processing: { label: 'Processing', icon: 'sync-outline', color: '#3B82F6', desc: 'Your payment is confirmed. We are preparing your order.' },
  completed: { label: 'Delivered', icon: 'checkmark-circle-outline', color: '#22C55E', desc: 'Your order has been delivered. Enjoy your UCFilter system!' },
  shipped: { label: 'Shipped', icon: 'car-outline', color: '#06B6D4', desc: 'Your order is on its way to you.' },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline', color: '#EF4444', desc: 'This order was cancelled.' },
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const api = useApi();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.getOrders(),
  });

  const order = orders?.find(o => String(o.id) === id);
  const statusCfg = STATUS_CONFIG[order?.status ?? 'pending'] ?? STATUS_CONFIG['pending']!;

  if (isLoading || !order) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="checkmark-circle" size={60} color={colors.success} />
        <Text style={[styles.successTitle, { color: colors.text }]}>Order Confirmed!</Text>
        <Text style={[styles.successSub, { color: colors.mutedForeground }]}>Order #{id}</Text>
        <Text style={[styles.successSub, { color: colors.mutedForeground }]}>
          You'll receive a confirmation message shortly.
        </Text>
      </View>
    );
  }

  const date = new Date(order.dateCreated).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: Platform.OS === 'web' ? 34 : 40 }}>

      {/* Status card */}
      <View style={[styles.statusCard, { backgroundColor: statusCfg.color + '10', borderColor: statusCfg.color }]}>
        <Ionicons name={statusCfg.icon} size={36} color={statusCfg.color} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          <Text style={[styles.statusDesc, { color: colors.text }]}>{statusCfg.desc}</Text>
        </View>
      </View>

      {/* Order info */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Order Details</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Order #</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{order.id}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Date</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{date}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Payment</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {order.paymentMethod === 'mpesa' ? 'M-Pesa' :
             order.paymentMethod === 'stripe' ? 'Credit Card' :
             order.paymentMethod === 'paystack' ? 'Paystack' : 'Cash on Delivery'}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Total</Text>
          <Text style={[styles.infoValue, { color: colors.primary, fontWeight: '700' as const }]}>
            {order.currency} {parseFloat(order.total).toLocaleString('en-KE')}
          </Text>
        </View>
      </View>

      {/* Items */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Items Ordered</Text>
        {order.lineItems.map((item, i) => (
          <View key={i} style={styles.lineItem}>
            <View style={[styles.lineIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="water-outline" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.lineName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
            <Text style={[styles.lineQty, { color: colors.mutedForeground }]}>×{item.quantity}</Text>
            <Text style={[styles.lineTotal, { color: colors.primary }]}>
              KES {parseFloat(item.total).toLocaleString()}
            </Text>
          </View>
        ))}
      </View>

      {/* Shipping */}
      {order.shippingAddress && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Delivery Address</Text>
          <Text style={[styles.addressText, { color: colors.text }]}>
            {order.shippingAddress.firstName} {order.shippingAddress.lastName}
          </Text>
          <Text style={[styles.addressText, { color: colors.mutedForeground }]}>{order.shippingAddress.address1}</Text>
          <Text style={[styles.addressText, { color: colors.mutedForeground }]}>{order.shippingAddress.city}</Text>
          {order.shippingAddress.phone && (
            <Text style={[styles.addressText, { color: colors.mutedForeground }]}>{order.shippingAddress.phone}</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderWidth: 1.5, borderRadius: 14, padding: 16 },
  statusLabel: { fontSize: 17, fontWeight: '700' as const },
  statusDesc: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' as const },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14 },
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lineName: { flex: 1, fontSize: 13 },
  lineQty: { fontSize: 13 },
  lineTotal: { fontSize: 13, fontWeight: '600' as const },
  addressText: { fontSize: 14 },
  successTitle: { fontSize: 26, fontWeight: '700' as const, marginTop: 16 },
  successSub: { fontSize: 15, textAlign: 'center', paddingHorizontal: 40, marginTop: 8 },
});
