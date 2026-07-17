---
name: Resend connector email delivery
description: How UC email delivery is routed and the domain-verification constraint on the user's Resend account.
---
Email delivery order: Resend (Replit connector via `@replit/connectors-sdk` proxy; direct API only when `RESEND_API_KEY`/`RESEND_BASE_URL` set — tests use the latter as a stub) → SendGrid/SMTP chain fallback.

**Constraint:** the user's Resend account has only `contacts.ucfilters.com` added (sending domain), and as of 2026-07-17 its DNS verification was NOT complete — Resend returns 403 `validation_error` until verified at resend.com/domains. From-addresses must be `...@contacts.ucfilters.com`, not `@ucfilters.com`.

**Why:** Resend rejects any from-address on an unverified domain; wiring is correct but delivery silently falls back until the user finishes DNS setup.

**How to apply:** if office/enquiry emails aren't arriving, first check Resend domain status via connector proxy `GET /domains` before touching code. Never log Resend response bodies (they can echo PII); log status + error name only.
