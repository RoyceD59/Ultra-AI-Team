/**
 * FilterTrackerSection
 *
 * Renders the "My Filter" card inside the Account screen.
 *
 *  • Not registered → prompt card with "Register Filter" button
 *  • Registered      → product name, lifespan progress bar, days remaining,
 *                       "Filter Replaced" button
 *
 * Also owns the full registration modal:
 *   Step 1 — pick the product
 *   Step 2 — pick how many days ago it was installed
 *   Confirm → scheduleAllFilterNotifications
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView,
  Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import * as Haptics from 'expo-haptics';
import {
  FILTER_PRODUCTS,
  FilterActivation,
  scheduleAllFilterNotifications,
  clearFilterActivation,
  getNotificationPermissionStatus,
  requestNotificationPermission,
} from '@/hooks/useNotifications';

// ── Day-offset options ────────────────────────────────────────────────────────
const DAY_OFFSETS = [
  { label: 'Today',      days: 0 },
  { label: '1 week ago', days: 7 },
  { label: '2 weeks ago', days: 14 },
  { label: '1 month ago', days: 30 },
  { label: '2 months ago', days: 60 },
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  activation:    FilterActivation | null;
  onActivationChange: (a: FilterActivation | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysRemaining(activation: FilterActivation): number {
  const elapsed = Math.floor((Date.now() - new Date(activation.activatedAt).getTime()) / 86_400_000);
  return activation.lifespanDays - elapsed;
}

function progressPercent(activation: FilterActivation): number {
  const elapsed = Math.floor((Date.now() - new Date(activation.activatedAt).getTime()) / 86_400_000);
  return Math.min(100, Math.max(0, Math.round((elapsed / activation.lifespanDays) * 100)));
}

function statusColor(daysLeft: number, primary: string, warning: string, destructive: string): string {
  if (daysLeft <= 0)  return destructive;
  if (daysLeft <= 30) return warning;
  return primary;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function FilterTrackerSection({ activation, onActivationChange }: Props) {
  const colors = useColors();
  const [showModal, setShowModal] = useState(false);

  function openModal() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowModal(true);
  }

  async function handleReset() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearFilterActivation();
    onActivationChange(null);
  }

  const daysLeft = activation ? daysRemaining(activation) : null;
  const pct      = activation ? progressPercent(activation) : 0;
  const barColor = daysLeft !== null
    ? statusColor(daysLeft, colors.primary, '#F59E0B', '#EF4444')
    : colors.primary;

  return (
    <>
      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>My Filter</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {activation ? (
            <>
              {/* Product + status */}
              <View style={styles.row}>
                <View style={[styles.iconWrap, { backgroundColor: barColor + '18' }]}>
                  <Ionicons name="water" size={20} color={barColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.productName, { color: colors.text }]} numberOfLines={1}>
                    {activation.productName}
                  </Text>
                  <Text style={[styles.daysText, { color: barColor }]}>
                    {daysLeft !== null && daysLeft > 0
                      ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`
                      : 'Filter replacement overdue'}
                  </Text>
                </View>
                <TouchableOpacity onPress={openModal} style={[styles.replaceBtn, { borderColor: colors.primary }]}>
                  <Text style={[styles.replaceBtnTxt, { color: colors.primary }]}>Replace</Text>
                </TouchableOpacity>
              </View>

              {/* Progress bar */}
              <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
                <View style={[styles.progressFill, { width: `${pct}%` as unknown as number, backgroundColor: barColor }]} />
              </View>
              <View style={styles.progressLabels}>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>Installed</Text>
                <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
                  {activation.lifespanDays}d rated life
                </Text>
              </View>

              {/* Divider + notification summary */}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.row}>
                <Ionicons name="notifications-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.notifNote, { color: colors.mutedForeground }]}>
                  {activation.notifIds.length > 0
                    ? `${activation.notifIds.length} reminders scheduled`
                    : 'Enable notifications to get reminders'}
                </Text>
              </View>
            </>
          ) : (
            /* Not yet registered */
            <TouchableOpacity onPress={openModal} style={styles.registerRow} activeOpacity={0.8}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="water-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.productName, { color: colors.text }]}>Register your filter</Text>
                <Text style={[styles.subText, { color: colors.mutedForeground }]}>
                  Get personalised maintenance reminders and discount offers
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Registration / Replace Modal ─────────────────────────────────── */}
      <RegisterModal
        visible={showModal}
        existingActivation={activation}
        onClose={() => setShowModal(false)}
        onSave={a => { onActivationChange(a); setShowModal(false); }}
      />
    </>
  );
}

// ── Registration modal ────────────────────────────────────────────────────────
interface ModalProps {
  visible: boolean;
  existingActivation: FilterActivation | null;
  onClose: () => void;
  onSave: (a: FilterActivation) => void;
}

function RegisterModal({ visible, existingActivation, onClose, onSave }: ModalProps) {
  const colors = useColors();
  const [step, setStep]         = useState<1 | 2>(1);
  const [productId, setProductId]     = useState<number | null>(null);
  const [dayOffset, setDayOffset]     = useState(0);
  const [saving, setSaving]     = useState(false);

  const reset = useCallback(() => {
    setStep(1); setProductId(null); setDayOffset(0); setSaving(false);
  }, []);

  const selectedProduct = FILTER_PRODUCTS.find(p => p.id === productId);

  async function handleSave() {
    if (!selectedProduct) return;
    setSaving(true);
    try {
      // Ensure permission is granted before scheduling
      const status = await getNotificationPermissionStatus();
      if (status !== 'granted') {
        await requestNotificationPermission();
      }

      const activatedAt = new Date(Date.now() - dayOffset * 86_400_000).toISOString();
      const activation = await scheduleAllFilterNotifications({
        activatedAt,
        productId:    selectedProduct.id,
        productName:  selectedProduct.name,
        lifespanDays: selectedProduct.lifespanDays,
      });
      onSave(activation);
      reset();
    } finally {
      setSaving(false);
    }
  }

  function handleClose() { reset(); onClose(); }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            {step === 2 && (
              <TouchableOpacity onPress={() => setStep(1)} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.primary} />
              </TouchableOpacity>
            )}
            <Text style={[styles.sheetTitle, { color: colors.text }]}>
              {step === 1
                ? existingActivation ? 'New Filter Installed' : 'Register Your Filter'
                : 'When was it installed?'}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {step === 1 ? (
            /* Step 1: Product picker */
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                Select the filter you installed:
              </Text>
              {FILTER_PRODUCTS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => { setProductId(p.id); setStep(2); }}
                  activeOpacity={0.8}
                  style={[
                    styles.productRow,
                    { backgroundColor: colors.card, borderColor: productId === p.id ? colors.primary : colors.border },
                  ]}>
                  <View style={[styles.productIconWrap, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name={p.icon as never} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.productRowName, { color: colors.text }]}>{p.name}</Text>
                    <Text style={[styles.productRowLife, { color: colors.mutedForeground }]}>
                      {p.lifespanDays < 90
                        ? `${p.lifespanDays}-day lifespan`
                        : p.lifespanDays < 365
                        ? `${Math.round(p.lifespanDays / 30)}-month lifespan`
                        : `${Math.round(p.lifespanDays / 365)}-year lifespan`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            /* Step 2: Date picker */
            <View style={[styles.sheetBody, { flex: 1 }]}>
              <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
                {selectedProduct?.name} — {selectedProduct?.lifespanDays}-day lifespan
              </Text>
              <Text style={[styles.stepHint, { color: colors.mutedForeground, marginTop: 4, marginBottom: 8 }]}>
                How long ago did you install it?
              </Text>
              <View style={{ gap: 10 }}>
                {DAY_OFFSETS.map(o => (
                  <TouchableOpacity
                    key={o.days}
                    onPress={() => setDayOffset(o.days)}
                    activeOpacity={0.8}
                    style={[
                      styles.offsetRow,
                      {
                        backgroundColor: dayOffset === o.days ? colors.primary : colors.card,
                        borderColor: dayOffset === o.days ? colors.primary : colors.border,
                      },
                    ]}>
                    <Text style={[
                      styles.offsetLabel,
                      { color: dayOffset === o.days ? '#fff' : colors.text },
                    ]}>
                      {o.label}
                    </Text>
                    {dayOffset === o.days && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
                style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}>
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveBtnTxt}>
                      {existingActivation ? 'Record Replacement' : 'Register & Schedule Reminders'}
                    </Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  section:         { gap: 12 },
  sectionTitle:    { fontSize: 17, fontWeight: '700' as const },
  card:            { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  row:             { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap:        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  productName:     { fontSize: 14, fontWeight: '600' as const },
  daysText:        { fontSize: 13, fontWeight: '500' as const, marginTop: 2 },
  subText:         { fontSize: 12, marginTop: 2, lineHeight: 16 },
  replaceBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  replaceBtnTxt:   { fontSize: 13, fontWeight: '600' as const },
  progressTrack:   { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:    { height: 6, borderRadius: 3 },
  progressLabels:  { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel:   { fontSize: 11 },
  divider:         { height: 1 },
  notifNote:       { fontSize: 12, marginLeft: 4 },
  registerRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },

  // Modal
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:           { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 16, maxHeight: '85%' },
  handle:          { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 8 },
  backBtn:         { padding: 4 },
  sheetTitle:      { flex: 1, fontSize: 17, fontWeight: '700' as const },
  closeBtn:        { padding: 4 },
  sheetBody:       { paddingHorizontal: 16, paddingBottom: 16 },
  stepHint:        { fontSize: 13 },
  productRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  productIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  productRowName:  { fontSize: 14, fontWeight: '600' as const },
  productRowLife:  { fontSize: 12, marginTop: 2 },
  offsetRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13 },
  offsetLabel:     { fontSize: 15, fontWeight: '500' as const },
  saveBtn:         { borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  saveBtnTxt:      { color: '#fff', fontSize: 15, fontWeight: '700' as const },
});
