/**
 * AI Water Quality Assistant chat screen
 *
 * Opens from:
 *   • Support tab  — generic entry, no filter context
 *   • FilterTrackerSection — passes productName, daysRemaining, waterSource, etc.
 *
 * Navigation params (all optional):
 *   productName, daysRemaining, waterSource, lastCheckIn, cleanCount
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApi } from '@/hooks/useApi';
import * as Haptics from 'expo-haptics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:      string;
  role:    'user' | 'assistant';
  content: string;
}

interface FilterContext {
  productName?:   string;
  daysRemaining?: number;
  waterSource?:   string;
  lastCheckIn?:   string;
  cleanCount?:    number;
}

// ── Greeting helpers ──────────────────────────────────────────────────────────

const GENERIC_GREETING =
  "Hi! I'm your Ultra-Clear AI Water Assistant 💧\n\nAsk me anything — why your water smells like chlorine, how to get better flow, when to replace your filter, or what borehole water means for your health. I'm here to help.";

function buildContextGreeting(ctx: FilterContext): string {
  const parts: string[] = [];
  if (ctx.productName)                 parts.push(`You have a **${ctx.productName}**`);
  if (ctx.daysRemaining !== undefined) {
    parts.push(ctx.daysRemaining > 0
      ? `with **${ctx.daysRemaining} day${ctx.daysRemaining === 1 ? '' : 's'}** left on the cartridge`
      : "with a **cartridge that's overdue for replacement**");
  }
  if (ctx.waterSource) {
    const labels: Record<string, string> = {
      mains:    'on Nairobi mains water',
      borehole: 'on borehole water',
      surface:  'on surface/rainwater',
      mixed:    'on mixed mains + borehole',
    };
    parts.push(labels[ctx.waterSource] ?? `on ${ctx.waterSource} water`);
  }

  const intro = parts.length > 0
    ? `Hi! I can see ${parts.join(', ')}. `
    : "Hi! ";

  return `${intro}Ask me anything — about your filter performance, water taste, when to replace, or Nairobi water quality in general.`;
}

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS_GENERIC = [
  "Why does my water smell like chlorine after filtering?",
  "Is borehole water safe to drink?",
  "How do I know when to replace my filter?",
];

function buildSuggestions(ctx: FilterContext): string[] {
  const s: string[] = [];
  if (ctx.productName) {
    s.push(`How do I clean my ${ctx.productName}?`);
  }
  if (ctx.waterSource === 'borehole') {
    s.push("Does my filter remove iron from borehole water?");
  } else if (ctx.waterSource === 'surface') {
    s.push("How does rainy season affect my filter life?");
  } else {
    s.push("Why does Nairobi water taste like chlorine?");
  }
  s.push("When should I replace my cartridge?");
  return s.slice(0, 3);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AiChatScreen() {
  const colors  = useColors();
  const router  = useRouter();
  const api     = useApi();

  const params = useLocalSearchParams<{
    productName?:   string;
    daysRemaining?: string;
    waterSource?:   string;
    lastCheckIn?:   string;
    cleanCount?:    string;
  }>();

  const filterContext: FilterContext = {
    productName:   params.productName   || undefined,
    daysRemaining: params.daysRemaining ? Number(params.daysRemaining) : undefined,
    waterSource:   params.waterSource   || undefined,
    lastCheckIn:   params.lastCheckIn   || undefined,
    cleanCount:    params.cleanCount    ? Number(params.cleanCount)    : undefined,
  };

  const hasContext = Boolean(filterContext.productName || filterContext.waterSource);
  const initialGreeting = hasContext ? buildContextGreeting(filterContext) : GENERIC_GREETING;
  const suggestions     = hasContext ? buildSuggestions(filterContext)     : SUGGESTIONS_GENERIC;

  const [messages, setMessages] = useState<Message[]>([
    { id: 'greeting', role: 'assistant', content: initialGreeting },
  ]);
  const [input,   setInput]   = useState('');
  const [sending, setSending] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const listRef = useRef<FlatList<Message>>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  // ── Send logic ──────────────────────────────────────────────────────────────

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setShowSuggestions(false);

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    if (!textOverride) setInput('');
    setSending(true);
    scrollToBottom();

    // History to send — skip the initial greeting (it's context, not a real turn)
    const history = updatedMessages
      .filter(m => m.id !== 'greeting')
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const { reply } = await api.waterAiChat(history, filterContext);
      const aiMsg: Message = { id: `a-${Date.now()}`, role: 'assistant', content: reply };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      const errMsg: Message = {
        id:      `err-${Date.now()}`,
        role:    'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment, or contact UCFilters support at +254 700 000 000 or support@ucfilters.co.ke.",
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderMessage({ item }: { item: Message }) {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="water" size={13} color={colors.primary} />
          </View>
        )}
        <View style={[
          styles.bubble,
          isUser
            ? [styles.bubbleUser, { backgroundColor: colors.primary }]
            : [styles.bubbleAI,   { backgroundColor: colors.surface, borderColor: colors.border }],
        ]}>
          <Text style={[styles.bubbleText, { color: isUser ? '#fff' : colors.text }]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  }

  const topPad = Platform.OS === 'web' ? 67 : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border, marginTop: topPad }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <View style={[styles.headerIcon, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="water" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Water AI Assistant</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Powered by Ultra-Clear AI</Text>
        </View>
      </View>

      {/* ── Messages + input ────────────────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToBottom}
          ListFooterComponent={
            <>
              {/* Typing indicator */}
              {sending && (
                <View style={[styles.msgRow, { marginTop: 4 }]}>
                  <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="water" size={13} color={colors.primary} />
                  </View>
                  <View style={[styles.bubble, styles.bubbleAI, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TypingDots color={colors.mutedForeground} />
                  </View>
                </View>
              )}

              {/* Suggestion chips — shown only before first user message */}
              {showSuggestions && !sending && (
                <View style={styles.suggestions}>
                  {suggestions.map(s => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => handleSend(s)}
                      activeOpacity={0.8}
                      style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.primary + '60' }]}>
                      <Text style={[styles.chipText, { color: colors.primary }]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          }
        />

        {/* ── Input bar ──────────────────────────────────────────────────── */}
        <View style={[styles.inputBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your water or filter…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            multiline
            maxLength={600}
            returnKeyType={Platform.OS === 'ios' ? 'default' : 'send'}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={() => handleSend()}
            disabled={!input.trim() || sending}
            activeOpacity={0.8}
            style={[
              styles.sendBtn,
              { backgroundColor: input.trim() && !sending ? colors.primary : colors.border },
            ]}>
            <Ionicons name="send" size={17} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Typing animation ──────────────────────────────────────────────────────────

function TypingDots({ color }: { color: string }) {
  return (
    <View style={styles.typingRow}>
      <ActivityIndicator size="small" color={color} />
      <Text style={[styles.typingText, { color }]}>thinking…</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1 },

  header:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backBtn:      { padding: 2 },
  headerIcon:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 15, fontWeight: '700' as const },
  headerSub:    { fontSize: 12, marginTop: 1 },

  list:         { padding: 16, gap: 10, paddingBottom: 12 },

  msgRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser:   { flexDirection: 'row-reverse' },
  avatar:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  bubble:       { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  bubbleUser:   { borderTopRightRadius: 4, borderWidth: 0 },
  bubbleAI:     { borderTopLeftRadius: 4 },
  bubbleText:   { fontSize: 14, lineHeight: 22 },

  typingRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText:   { fontSize: 13 },

  suggestions:  { gap: 8, marginTop: 12 },
  chip:         { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipText:     { fontSize: 13, fontWeight: '500' as const },

  inputBar:     {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    borderTopWidth: 1,
  },
  input:        { flex: 1, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 14, maxHeight: 110 },
  sendBtn:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
