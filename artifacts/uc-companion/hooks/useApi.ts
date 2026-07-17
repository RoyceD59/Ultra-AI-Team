import { useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

const getBase = () =>
  process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : 'http://localhost:8080';

export interface UCProduct {
  id: number;
  name: string;
  price: string;
  regularPrice: string;
  salePrice: string;
  description: string;
  shortDescription: string;
  categories: { id: number; name: string }[];
  images: { src: string; alt: string }[];
  sku: string;
  stockStatus: 'instock' | 'outofstock';
  stockQuantity: number | null;
  tags: { name: string }[];
  enquiryOnly?: boolean;
}

export interface UCEnquiry {
  id: number;
  productId: string;
  productName: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  createdAt: string;
}

export interface UCOrder {
  id: number;
  status: string;
  dateCreated: string;
  total: string;
  currency: string;
  lineItems: { productId: number; name: string; quantity: number; total: string }[];
  paymentMethod: string;
  shippingAddress: UCAddress;
}

export interface UCAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  country: string;
  phone: string;
}

export interface UCCustomer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  billing: UCAddress;
  shipping: UCAddress;
}

export interface MapLocation {
  id: string;
  type: 'experience_centre' | 'refill_atm';
  name: string;
  address: string;
  lat: number;
  lng: number;
  hours: string;
  phone: string | null;
}

export interface MaintenanceTicket {
  id: string;
  productModel: string;
  issueDescription: string;
  preferredContactTime: string;
  photos: string[];
  status: 'submitted' | 'in_progress' | 'resolved';
  createdAt: string;
}

export interface WaterTestRequest {
  id: string;
  name: string;
  address: string;
  phone: string;
  waterSource: string;
  concerns: string;
  status: 'pending' | 'scheduled' | 'completed';
  createdAt: string;
}

export interface MpesaResponse {
  checkoutRequestId: string;
  merchantRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
}

export interface MpesaStatusResult {
  status: 'pending' | 'success' | 'failed';
  resultDesc?: string;
}

export interface StripeSessionResponse {
  sessionId: string;
  sessionUrl: string;
  amount: number;
}

export interface StripeSessionStatus {
  status: string | null;
  paymentStatus: string;
}

export interface PaystackInitResponse {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaymentVerifyResult {
  success: boolean;
  orderId?: number;
  message: string;
}

export interface UCReferralInfo {
  code: string;
  referredCount: number;
  conversions: number;
  creditsEarnedKes: number;
  usedReferralCode: string | null;
  shareMessage: string;
}

export interface UCPromotion {
  id: string;
  title: string;
  description: string;
  code: string;
  discountPercent: number;
  expiresAt: string;
  active: boolean;
  createdAt: string;
}

export interface CodeValidationResult {
  valid: boolean;
  type: 'referral' | 'promotion' | null;
  discountPercent: number;
  label: string;
}

export function useApi() {
  const { token } = useAuth();

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }, [token]);

  const get = useCallback(async <T>(path: string): Promise<T> => {
    const res = await fetch(`${getBase()}${path}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<T>;
  }, [authHeaders]);

  const post = useCallback(async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${getBase()}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error || `${res.status}`);
    }
    return res.json() as Promise<T>;
  }, [authHeaders]);

  const patch = useCallback(async <T>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`${getBase()}${path}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error || `${res.status}`);
    }
    return res.json() as Promise<T>;
  }, [authHeaders]);

  return {
    getProducts: (params?: { category?: string; search?: string }) => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set('category', params.category);
      if (params?.search) qs.set('search', params.search);
      return get<UCProduct[]>(`/api/uc/products?${qs}`);
    },
    getProduct: (id: number) => get<UCProduct>(`/api/uc/products/${id}`),
    getProfile: () => get<UCCustomer>('/api/uc/customer/profile'),
    getOrders: () => get<UCOrder[]>('/api/uc/orders'),
    createOrder: (data: {
      lineItems: { productId: number; quantity: number }[];
      paymentMethod: string;
      paymentReference: string;
      shippingAddress: UCAddress;
      promoCode?: string;
      userEmail?: string;
    }) => post<UCOrder>('/api/uc/orders', data),
    getLocations: () => get<MapLocation[]>('/api/uc/locations'),
    getTickets: () => get<MaintenanceTicket[]>('/api/uc/tickets'),
    createTicket: (data: {
      productModel: string;
      issueDescription: string;
      preferredContactTime: string;
      photos: string[];
      videos?: string[];
    }) => post<MaintenanceTicket>('/api/uc/tickets', data),
    createWaterTest: (data: {
      name: string;
      address: string;
      phone: string;
      waterSource: string;
      concerns: string;
      photos?: string[];
      videos?: string[];
    }) => post<WaterTestRequest>('/api/uc/water-tests', data),
    mpesaSTKPush: (phone: string, amount: number, orderId: string) =>
      post<MpesaResponse>('/api/payments/mpesa', { phone, amount, orderId }),
    mpesaStatus: (checkoutRequestId: string) =>
      get<MpesaStatusResult>(`/api/payments/mpesa/status/${checkoutRequestId}`),
    stripeSession: (amount: number, orderId: string) =>
      post<StripeSessionResponse>('/api/payments/stripe/session', { amount, currency: 'kes', orderId }),
    stripeSessionStatus: (sessionId: string) =>
      get<StripeSessionStatus>(`/api/payments/stripe/session/${sessionId}`),
    paystackVerify: (reference: string) =>
      get<{ success: boolean; status: string }>(`/api/payments/paystack/verify/${encodeURIComponent(reference)}`),
    paystackInit: (email: string, amount: number) =>
      post<PaystackInitResponse>('/api/payments/paystack/init', { email, amount }),
    verifyPayment: (reference: string, method: string) =>
      post<PaymentVerifyResult>('/api/payments/verify', { reference, method }),
    getMyReferral: () => get<UCReferralInfo>('/api/uc/referrals/my-code'),
    validateCode: (code: string, userEmail?: string) =>
      post<CodeValidationResult>('/api/uc/referrals/validate', { code, userEmail }),
    getPromotions: () => get<UCPromotion[]>('/api/uc/promotions'),
    /** Update the authenticated user's profile details (name / phone). */
    updateProfile: (data: { firstName?: string; lastName?: string; phone?: string }) =>
      patch<UCCustomer>('/api/uc/customer/profile', data),

    /** Register an Expo push token for the authenticated user. */
    registerPushToken: (pushToken: string) =>
      post<{ ok: boolean }>('/api/uc/notify/register', { pushToken }),
    /** Sync server-side push notification opt-out preferences. */
    updatePushPrefs: (prefs: { optOutOrders: boolean }) =>
      post<{ ok: boolean }>('/api/uc/notify/prefs', prefs),
    /** Submit a product enquiry (works for guests and logged-in users). */
    createEnquiry: (data: {
      productId: number;
      productName: string;
      name: string;
      email: string;
      phone: string;
      message: string;
    }) => post<{ ok: boolean; message: string }>('/api/uc/enquiries', data),

    /** Send a message to the UC AI water quality assistant. */
    waterAiChat: (
      messages: Array<{ role: 'user' | 'assistant'; content: string }>,
      filterContext?: {
        productName?:   string;
        daysRemaining?: number;
        waterSource?:   string;
        lastCheckIn?:   string;
        cleanCount?:    number;
      },
    ) => post<{ reply: string }>('/api/uc/ai/water-chat', { messages, filterContext }),
  };
}
