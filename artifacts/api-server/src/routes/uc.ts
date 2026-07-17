import { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import {
  validateCodeForDiscount,
  recordReferralConversion,
  registerReferralAtSignup,
} from "./referrals";
import { issueToken, verifyToken } from "../lib/jwt.js";
import {
  sendSms,
  orderConfirmationSms,
  ticketConfirmationSms,
  waterTestConfirmationSms,
} from "../lib/sms.js";
import {
  sendEmail,
  buildOrderReceiptEmail,
  buildTicketConfirmationEmail,
  buildWaterTestConfirmationEmail,
} from "../lib/email.js";
import {
  db,
  ucPushTokensTable, ucEnquiriesTable, ucNotifPrefsTable,
  ucUsersTable, ucOrdersTable, ucOrderItemsTable, ucTicketsTable, ucWaterTestsTable,
  ucReviewsTable, ucProductMediaTable,
  type ReviewMediaItem, type UcProductMedia,
} from "@workspace/db";
import { eq, desc, inArray, and, asc } from "drizzle-orm";
import bcryptjs from "bcryptjs";
import { logger } from "../lib/logger";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";

const router = Router();

// ─── Mock data ────────────────────────────────────────────────────────────────
// Real Ultra Clear 2026 product catalogue — 5 segments, 27 products.
// When WooCommerce credentials are present these are bypassed entirely.
const CAT_BOTTLES   = { id: 1, name: "Bottles & Portable" };
const CAT_HOME      = { id: 2, name: "Home Filters" };
const CAT_SHOWER    = { id: 3, name: "Shower & Skin" };
const CAT_ACCESS    = { id: 4, name: "Accessories" };
const CAT_SOLUTIONS = { id: 5, name: "Solutions" };

const MOCK_PRODUCTS: Record<string, unknown>[] = [
  // ── Segment 01 · Bottles & Portable Filters ──────────────────────────────
  {
    id: 1, name: "Hydra Flux", sku: "UC-BTL-HFX-001",
    price: "3499", regularPrice: "3499", salePrice: "",
    lifespanDays: 90,
    tagline: "Certified hydration, elevated.",
    description: "750ml BPA-free filter bottle with SGS-certified >99.9% bacteria removal. Ahlstrom Disruptor® filter. 60-second cartridge swap. Available in 4 colours. Filter: 150L or 3 months — whichever comes first.",
    shortDescription: "750ml certified filter bottle — 4 colours",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/hydra-flux-premium-filter-bottle.jpg", alt: "Hydra Flux" }],
    stockStatus: "instock", stockQuantity: 30,
    tags: [{ name: "bestseller" }],
  },
  {
    id: 2, name: "Truva Go", sku: "UC-BTL-TGO-002",
    price: "2599", regularPrice: "2599", salePrice: "",
    lifespanDays: 90,
    tagline: "Slim. Certified. Goes everywhere you go.",
    description: "Slim 750ml BPA-free filter bottle for urban commuters. Fits any bike holder or bag. Ahlstrom Disruptor® filter. 60-second filter replacement. SGS-certified. Filter: 150L or 3 months.",
    shortDescription: "Slim 750ml certified filter bottle for commuters",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/truva-go-slim-filter-bottle.jpg", alt: "Truva Go" }],
    stockStatus: "instock", stockQuantity: 25,
    tags: [],
  },
  {
    id: 3, name: "Viva Drop", sku: "UC-BTL-VDP-003",
    price: "2199", regularPrice: "2199", salePrice: "",
    lifespanDays: 90,
    tagline: "Compact. Certified. Carry it everywhere.",
    description: "Compact 500ml BPA-free filter bottle for desk, commute, campus, and gym. Ahlstrom Disruptor® filter with SGS-certified bacteria removal. Replaces daily plastic bottle purchases. Filter: 150L or 3 months.",
    shortDescription: "500ml compact certified filter bottle",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/viva-drop-compact-filter-bottle.jpg", alt: "Viva Drop" }],
    stockStatus: "instock", stockQuantity: 40,
    tags: [],
  },
  {
    id: 4, name: "Flex", sku: "UC-BTL-FLX-004",
    price: "2399", regularPrice: "2399", salePrice: "",
    lifespanDays: 90,
    tagline: "1 litre. Squeezable. Certified clean.",
    description: "1000ml squeezable BPA-free filter bottle. Ahlstrom Disruptor® filter with SGS-certified bacteria removal. Great for hiking, travel, and outdoor use. Filter: 150L or 3 months.",
    shortDescription: "1L squeezable certified filter bottle",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/flex-squeezable-filter-bottle.jpg", alt: "Flex" }],
    stockStatus: "instock", stockQuantity: 20,
    tags: [],
  },
  {
    id: 5, name: "Timbo", sku: "UC-BTL-TMB-005",
    price: "1299", regularPrice: "1299", salePrice: "",
    lifespanDays: 90,
    tagline: "350ml. Kids. Certified safe.",
    description: "350ml BPA-free kids' filter bottle. SGS-certified bacteria removal keeps your child's water safe at school, sports, and on the go. Easy-squeeze design. Filter: 150L or 3 months.",
    shortDescription: "350ml kids' certified filter bottle",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/timbo-kids-filter-bottle.jpg", alt: "Timbo" }],
    stockStatus: "instock", stockQuantity: 35,
    tags: [],
  },
  {
    id: 6, name: "Gym Buddy", sku: "UC-BTL-GYM-006",
    price: "2799", regularPrice: "2799", salePrice: "",
    lifespanDays: 90,
    tagline: "1.2L. Certified. Built for the grind.",
    description: "1200ml motivational filter bottle for gym-goers and athletes. SGS-certified bacteria removal. Wide-mouth design for ice. Ahlstrom Disruptor® filter. Filter: 150L or 3 months.",
    shortDescription: "1.2L motivational certified filter bottle",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/gym-buddy-1-2l-training-filter-bottle.jpg", alt: "Gym Buddy" }],
    stockStatus: "instock", stockQuantity: 20,
    tags: [],
  },
  {
    id: 7, name: "Survivor Straw", sku: "UC-STR-SVV-007",
    price: "1299", regularPrice: "1299", salePrice: "",
    // Catalogue does not confirm this filter's lifespan — conservative 180-day estimate.
    lifespanDays: 180,
    tagline: "Drink safe from any source.",
    description: "Portable emergency filter straw. SGS-certified filtration — drink directly from streams, taps, or any water source. Lightweight and compact. Filter life: estimated ~6 months (exact rating to be confirmed).",
    shortDescription: "Portable certified emergency filter straw",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/survivor-straw-filter.jpg", alt: "Survivor Straw" }],
    stockStatus: "instock", stockQuantity: 50,
    tags: [],
  },
  {
    id: 8, name: "Breeze", sku: "UC-BTL-BRZ-008",
    price: "1699", regularPrice: "1699", salePrice: "",
    lifespanDays: 90,
    tagline: "Entry-level certified filtration.",
    description: "500ml entry-level BPA-free filter bottle. SGS-certified bacteria removal. Ideal first certified filter bottle. Ahlstrom Disruptor® filter. Filter: 150L or 3 months.",
    shortDescription: "500ml entry-level certified filter bottle",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/breeze-filter-bottle.jpg", alt: "Breeze" }],
    stockStatus: "instock", stockQuantity: 45,
    tags: [],
  },
  {
    id: 9, name: "EcoSmart Elite", sku: "UC-ESE-ELT-009",
    price: "9799", regularPrice: "9799", salePrice: "",
    // Catalogue does not confirm this filter's lifespan — conservative 180-day estimate.
    lifespanDays: 180,
    tagline: "Solar. Electric. Always clean.",
    description: "Advanced portable filter with solar charging, electric pump, and built-in power bank. Multi-stage filtration: Nylon Mesh, UF Membrane 0.01µm, Ahlstrom Disruptor®, Carbon Block. Filter life: estimated ~6 months (exact rating to be confirmed).",
    shortDescription: "Solar-powered certified portable filter with power bank",
    categories: [CAT_BOTTLES],
    images: [{ src: "/api/uc/product-images/ecosmart-elite-field-purifier.jpg", alt: "EcoSmart Elite" }],
    stockStatus: "instock", stockQuantity: 10,
    tags: [{ name: "premium" }],
  },

  // ── Segment 02 · Home Water Filters ──────────────────────────────────────
  {
    id: 11, name: "Sweet Home", sku: "UC-FCT-SWH-011",
    price: "3699", regularPrice: "3699", salePrice: "",
    lifespanDays: 120,
    tagline: "Your tap. Certified. In under 5 minutes.",
    description: "Clips onto your kitchen tap in under 5 minutes — no tools, no plumber, no drilling. SGS-certified >99.9% bacteria removal. Removes chlorine, sediment, and selected heavy metals that boiling leaves behind. Filter: 4–5 months.",
    shortDescription: "Faucet filter — tool-free, SGS-certified, 4–5 month filter",
    categories: [CAT_HOME],
    images: [{ src: "/api/uc/product-images/sweet-home-faucet-filter.jpg", alt: "Sweet Home" }],
    stockStatus: "instock", stockQuantity: 30,
    tags: [{ name: "bestseller" }],
  },
  {
    id: 12, name: "Counter Reverse Osmosis", sku: "UC-HOM-CRO-012",
    price: "38999", regularPrice: "38999", salePrice: "",
    lifespanDays: 180,
    tagline: "Full RO purity. No drilling. No plumber.",
    description: "Counter-top reverse osmosis delivering multi-stage RO-grade purity without under-sink installation. Sits on your kitchen counter, connects to any standard tap. Removes bacteria, dissolved solids, heavy metals, and chlorine. Ideal for renters and apartments. SGS-certified. Filter: 6 months.",
    shortDescription: "Counter-top RO — no plumbing, SGS-certified, 6-month filter",
    categories: [CAT_HOME],
    images: [{ src: "/api/uc/product-images/counter-reverse-osmosis-system.jpg", alt: "Counter Reverse Osmosis" }],
    stockStatus: "instock", stockQuantity: 8,
    tags: [{ name: "premium" }],
  },
  {
    id: 13, name: "Electric Pitcher", sku: "UC-PCT-ELP-013",
    price: "10999", regularPrice: "10999", salePrice: "",
    lifespanDays: 90,
    tagline: "Counter-top certified water. No installation required.",
    description: "Ultra Clear's counter-top electric filtration pitcher — certified clean water without any tap attachment or installation. Fill from your kitchen tap, press to filter, pour certified clean. Multi-stage filtration with SGS-certified performance. Filter: 400L or 3 months.",
    shortDescription: "Electric counter-top filter pitcher — no installation",
    categories: [CAT_HOME],
    images: [{ src: "/api/uc/product-images/electric-pitcher-counter-top-filter.jpg", alt: "Electric Pitcher" }],
    stockStatus: "instock", stockQuantity: 12,
    tags: [],
  },
  {
    id: 14, name: "RO Home System", sku: "UC-ROS-HOM-022",
    price: "0", regularPrice: "0", salePrice: "",
    lifespanDays: 180,
    enquiryOnly: true,
    tagline: "Whole-home certified purity. Under the sink.",
    description: "Under-sink reverse osmosis home filtration in 50G, 75G, and 100G configurations. Multi-stage RO filtration removing bacteria, heavy metals, dissolved solids, and chlorine. Professional installation by Ultra Clear. Annual maintenance contract available. Filter: 6 months. Contact info@ucfilters.com for site assessment.",
    shortDescription: "Under-sink RO system — 50G/75G/100G, professional installation",
    categories: [CAT_HOME],
    images: [{ src: "/api/uc/product-images/ro-home-system.jpg", alt: "RO Home System" }],
    stockStatus: "instock", stockQuantity: 5,
    tags: [],
  },

  // ── Segment 03 · Shower & Skin Filters ───────────────────────────────────
  {
    id: 15, name: "J'adore", sku: "UC-SHW-JAD-015",
    price: "4399", regularPrice: "4399", salePrice: "",
    lifespanDays: 150,
    tagline: "Certified softer water. Every shower.",
    description: "Shower filter delivering SGS-certified >95% chlorine removal. Multi-layer filtration media: PP Cotton, KDF, Activated Carbon, Vitamin C. Universal attachment — fits any shower head. Filter: 5 months.",
    shortDescription: "Shower filter — 5-month filter, SGS-certified >95% chlorine removal",
    categories: [CAT_SHOWER],
    images: [{ src: "/api/uc/product-images/jadore-aluminium-shower-filter.jpg", alt: "J'adore" }],
    stockStatus: "instock", stockQuantity: 20,
    tags: [],
  },
  {
    id: 16, name: "Channel", sku: "UC-SHW-DFF-016",
    price: "3699", regularPrice: "3699", salePrice: "",
    lifespanDays: 135,
    tagline: "Purer water. Purer skincare results.",
    description: "Dedicated facial basin filter — SGS-certified >95% chlorine removal at the precise point your skincare routine begins and ends. The water used to cleanse and rinse your face affects how every product performs. Remove the chlorine first. Filter: 4–5 months.",
    shortDescription: "Facial basin filter — removes chlorine at the source of your skincare",
    categories: [CAT_SHOWER],
    images: [{ src: "/api/uc/product-images/channel-facial-basin-filter.jpg", alt: "Channel" }],
    stockStatus: "instock", stockQuantity: 18,
    tags: [],
  },
  {
    id: 17, name: "Derma Care", sku: "UC-SHW-DCR-017",
    price: "3299", regularPrice: "3299", salePrice: "",
    lifespanDays: 150,
    tagline: "Gentler water for sensitive skin, every day.",
    description: "Shower filter designed for sensitive, dry, and eczema-prone skin. SGS-certified >95% chlorine removal to reduce the daily chemical load that tap water places on vulnerable skin and scalp. Universal attachment. Filter: 5 months.",
    shortDescription: "Shower filter for sensitive skin — 5-month, SGS-certified",
    categories: [CAT_SHOWER],
    images: [{ src: "/api/uc/product-images/derma-care-shower-filter.jpg", alt: "Derma Care" }],
    stockStatus: "instock", stockQuantity: 15,
    tags: [],
  },
  {
    id: 18, name: "Pure Drop", sku: "UC-SKW-SHF-022",
    price: "2699", regularPrice: "2699", salePrice: "",
    lifespanDays: 150,
    tagline: "Certified clean. Simple. Every shower.",
    description: "SGS-certified shower filter delivering >95% chlorine removal with an easy universal attachment. Compact, lightweight design fits any shower head with no tools. 5-month filter life. The entry point to certified shower water. Filter media: PP Cotton, KDF, Activated Carbon.",
    shortDescription: "Entry-level shower filter — 5-month, universal fit",
    categories: [CAT_SHOWER],
    images: [{ src: "/api/uc/product-images/pure-drop-shower-filter.jpg", alt: "Pure Drop" }],
    stockStatus: "instock", stockQuantity: 25,
    tags: [],
  },
  {
    id: 19, name: "Derma Flux", sku: "UC-SKW-DFS-024",
    price: "6499", regularPrice: "6499", salePrice: "",
    lifespanDays: 135,
    tagline: "Softer water at the source. For every skincare ritual.",
    description: "Faucet-mounted facial filter with SGS-certified >95% chlorine removal at your basin. 6-layer precision filtration: PP Cotton, Carbon Fibre, KDF, Vitamin C, PSS, and UF Membrane. Tool-free install. Perspective window shows condition in real time — swap when colour shifts. Filter: 4–5 months.",
    shortDescription: "Faucet facial filter — 6-layer, perspective window, 4–5 months",
    categories: [CAT_SHOWER],
    images: [{ src: "/api/uc/product-images/derma-flux-faucet-facial-filter.jpg", alt: "Derma Flux" }],
    stockStatus: "instock", stockQuantity: 12,
    tags: [{ name: "premium" }],
  },

  // ── Segment 04 · Accessories & Replacements ──────────────────────────────
  {
    id: 20, name: "Gift & Bundle Sets", sku: "UC-ACC-GFT-020",
    price: "0", regularPrice: "0", salePrice: "",
    lifespanDays: 0,
    enquiryOnly: true,
    tagline: "The gift of certified clean water.",
    description: "Curated gift and bundle sets — mix and match Ultra Clear products. Filter lifespan varies by bundle contents. Contact us to build your perfect bundle.",
    shortDescription: "Mix & match gift bundles — contact us for pricing",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/gift-and-bundle-sets.jpg", alt: "Gift Sets" }],
    stockStatus: "instock", stockQuantity: 999,
    tags: [],
  },
  {
    id: 21, name: "Bottle Carry Sleeve", sku: "UC-ACC-SLV-021",
    price: "0", regularPrice: "0", salePrice: "",
    lifespanDays: 0,
    enquiryOnly: true,
    tagline: "Protect your bottle in style.",
    description: "Neoprene and crochet carry sleeves in universal fit for all Ultra Clear bottles. No filter media — housing accessory only. Price on request.",
    shortDescription: "Neoprene & crochet bottle sleeve — universal fit",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/ultra-clear-bottle-carry-sleeve-crocheted.jpg", alt: "Bottle Carry Sleeve" }],
    stockStatus: "instock", stockQuantity: 999,
    tags: [],
  },
  {
    id: 22, name: "Bottle Filter Cartridge", sku: "UC-RPL-BTL-010",
    price: "1099", regularPrice: "1099", salePrice: "",
    lifespanDays: 90,
    tagline: "Genuine replacement. Keep the certification active.",
    description: "Genuine Ahlstrom Disruptor® replacement cartridge for all Ultra Clear filter bottles (Hydra Flux, Truva Go, Viva Drop, Flex, Timbo, Gym Buddy, Breeze). Maintains SGS-certified >99.9% bacteria removal. Replace every 150L or 3 months.",
    shortDescription: "Genuine replacement cartridge for all UC filter bottles — 3 months",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/bottle-filter-cartridge.jpg", alt: "Bottle Filter Cartridge" }],
    stockStatus: "instock", stockQuantity: 100,
    tags: [{ name: "replacement" }, { name: "bestseller" }],
  },
  {
    id: 23, name: "Faucet Filter Cartridge", sku: "UC-RPL-FCT-014",
    price: "1999", regularPrice: "1999", salePrice: "",
    lifespanDays: 120,
    tagline: "Replace every 4–5 months. Keep the certification active.",
    description: "Genuine replacement cartridge for the Sweet Home Faucet Filter. Maintains SGS-certified >99.9% bacteria removal and >95% chlorine removal performance. Replace every 4–5 months or ~1,500–2,000 litres. Ultra Clear replacement reminders included.",
    shortDescription: "Genuine replacement cartridge for Sweet Home faucet filter — 4–5 months",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/home-sweet-home-faucet-filter-cartridge.jpg", alt: "Faucet Filter Cartridge" }],
    stockStatus: "instock", stockQuantity: 80,
    tags: [{ name: "replacement" }],
  },
  {
    id: 24, name: "Shower Filter Cartridge", sku: "UC-RPL-SHW-018",
    price: "1499", regularPrice: "1499", salePrice: "",
    lifespanDays: 150,
    tagline: "Replace every 5 months. Keep every shower certified.",
    description: "Genuine replacement cartridge for the J'adore, Derma Care, and Pure Drop shower and basin filters. Maintains SGS-certified >95% chlorine removal. Multi-layer filtration media: PP Cotton, KDF, Activated Carbon, Vitamin C. Replace every 5 months.",
    shortDescription: "Genuine shower cartridge for J'adore, Derma Care, Pure Drop — 5 months",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/shower-filter-cartridge.jpg", alt: "Shower Filter Cartridge" }],
    stockStatus: "instock", stockQuantity: 60,
    tags: [{ name: "replacement" }],
  },
  {
    id: 25, name: "Derma Flux Cartridge", sku: "UC-SKW-DFO-025",
    price: "2499", regularPrice: "2499", salePrice: "",
    lifespanDays: 120,
    tagline: "Replace every 4 months. Keep the skincare edge.",
    description: "Genuine replacement cartridge for the Derma Flux facial faucet filter. Precision 6-layer filtration: PP Cotton, Carbon Fibre, KDF, Vitamin C, PSS, and UF Membrane. Perspective window shows condition — swap when colour shifts. Maintains SGS-certified >95% chlorine removal. Replace every 4–5 months.",
    shortDescription: "Genuine 6-layer replacement cartridge for Derma Flux — 4–5 months",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/derma-flux-filter-cartridge.jpg", alt: "Derma Flux Cartridge" }],
    stockStatus: "instock", stockQuantity: 40,
    tags: [{ name: "replacement" }],
  },
  {
    id: 26, name: "Survivor Straw Cartridge", sku: "UC-BOG-FCS-017",
    price: "499", regularPrice: "499", salePrice: "",
    // Matches Survivor Straw: lifespan unconfirmed — conservative 180-day estimate.
    lifespanDays: 180,
    tagline: "Renew the straw. Restore the protection.",
    description: "Genuine replacement filter cartridge for the Ultra Clear Survivor Straw. Restores full SGS-certified filtration performance. Compact, lightweight, and easy to swap in the field. Replace when flow slows — estimated ~6 months (exact rating to be confirmed).",
    shortDescription: "Genuine replacement cartridge for Survivor Straw",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/survivor-straw-filter-cartridge.jpg", alt: "Survivor Straw Cartridge" }],
    stockStatus: "instock", stockQuantity: 100,
    tags: [{ name: "replacement" }],
  },
  {
    id: 27, name: "Filter Shell", sku: "UC-BOG-SHL-018",
    price: "499", regularPrice: "499", salePrice: "",
    lifespanDays: 0,
    tagline: "The shell that carries the clean.",
    description: "Replacement outer shell for the Survivor Straw filter. Durable BPA-free housing with universal thread fit — pair with a fresh Survivor Straw Cartridge for a fully rebuilt straw at minimal cost. Lightweight and compact.",
    shortDescription: "Replacement housing shell for Survivor Straw",
    categories: [CAT_ACCESS],
    images: [{ src: "/api/uc/product-images/filter-shell-straw-shell.jpg", alt: "Filter Shell" }],
    stockStatus: "instock", stockQuantity: 50,
    tags: [],
  },

  // ── Segment 05 · Solutions ────────────────────────────────────────────────
  {
    id: 29, name: "Aqua Stream 1200", sku: "UC-COM-UP-027",
    price: "69990", regularPrice: "69990", salePrice: "",
    lifespanDays: 210,
    tagline: "Institutional-grade certified water. Zero management overhead.",
    description: "Commercial reverse osmosis infrastructure for 50–200+ staff. Two configurations: Aqua Stream 1200 at KES 69,990 and Aqua Stream 1200 Pro on request. Full documentation pack (SGS, FDA, RoHS) within 24 hours. Annual ESG impact statement for corporate reporting. Site assessment, installation, and maintenance contract available. Filter: 6–9 months.",
    shortDescription: "Commercial 1200GPD RO system — KES 69,990 / Pro on request",
    categories: [CAT_SOLUTIONS],
    images: [{ src: "/api/uc/product-images/aqua-stream-1200-commercial-ro-system.jpg", alt: "Aqua Stream 1200" }],
    stockStatus: "instock", stockQuantity: 3,
    tags: [{ name: "commercial" }],
  },
  {
    id: 30, name: "Water ATMs", sku: "UC-ATM-001",
    price: "0", regularPrice: "0", salePrice: "",
    lifespanDays: 0,
    enquiryOnly: true,
    tagline: "KES 2–5 per litre. Certified. For every community.",
    description: "Pay-per-litre certified water infrastructure. Ultra Clear Water ATMs bring SGS-certified filtered water to communities at KES 2–5 per litre. Host and placement enquiries: info@ucfilters.com.",
    shortDescription: "Community certified water ATMs — host enquiries welcome",
    categories: [CAT_SOLUTIONS],
    images: [{ src: "/api/uc/product-images/ultra-clear-water-atm.jpg", alt: "Water ATMs" }],
    stockStatus: "instock", stockQuantity: 0,
    tags: [{ name: "commercial" }],
  },
];

const MOCK_LOCATIONS = [
  { id: "loc1", type: "experience_centre", name: "UC Experience Centre Westlands", address: "Woodvale Groove, Westlands, Nairobi", lat: -1.2633, lng: 36.8072, hours: "Mon–Sat 8am–6pm, Sun 10am–4pm", phone: "+254 700 123456" },
  { id: "loc2", type: "experience_centre", name: "UC Service Centre Karen", address: "Karen Hardy Estate, Karen, Nairobi", lat: -1.3319, lng: 36.7097, hours: "Mon–Fri 8am–5pm", phone: "+254 700 654321" },
  { id: "loc3", type: "refill_atm", name: "Water ATM – Village Market", address: "Village Market Mall, Limuru Rd, Gigiri", lat: -1.2194, lng: 36.8083, hours: "24/7", phone: null },
  { id: "loc4", type: "refill_atm", name: "Water ATM – Sarit Centre", address: "Sarit Centre, Karuna Rd, Westlands", lat: -1.2592, lng: 36.8027, hours: "6am–11pm daily", phone: null },
  { id: "loc5", type: "refill_atm", name: "Water ATM – Two Rivers Mall", address: "Two Rivers Mall, Rhapta Rd, Westlands", lat: -1.2178, lng: 36.7985, hours: "7am–10pm daily", phone: null },
  { id: "loc6", type: "refill_atm", name: "Water ATM – Garden City", address: "Garden City Mall, Thika Superhighway", lat: -1.2241, lng: 36.8801, hours: "6am–10pm daily", phone: null },
  { id: "loc7", type: "refill_atm", name: "Water ATM – Junction Mall", address: "Junction Mall, Ngong Rd, Nairobi", lat: -1.3003, lng: 36.7773, hours: "7am–9pm daily", phone: null },
];

// In-memory stores removed — all data now persists in PostgreSQL.
// Fallback arrays used only when the DB is temporarily unavailable.
const orderStoreFallback:  Record<string, unknown>[] = [];
const ticketStoreFallback: Record<string, unknown>[] = [];
const waterTestStoreFallback: Record<string, unknown>[] = [];

// ─── WooCommerce helpers ──────────────────────────────────────────────────────
function hasWCCredentials(): boolean {
  return !!(process.env["WC_CONSUMER_KEY"] && process.env["WC_CONSUMER_SECRET"]);
}

function wcUrl(path: string, extra: Record<string, string> = {}): string {
  const base = process.env["WC_BASE_URL"] || "https://www.ucfilters.com";
  const url = new URL(`${base}/wp-json/wc/v3${path}`);
  url.searchParams.set("consumer_key", process.env["WC_CONSUMER_KEY"]!);
  url.searchParams.set("consumer_secret", process.env["WC_CONSUMER_SECRET"]!);
  Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

async function wcFetchArray(
  path: string,
  extra: Record<string, string> = {}
): Promise<Record<string, unknown>[] | null> {
  try {
    const res = await fetch(wcUrl(path, extra));
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

async function wcFetchOne(
  path: string,
  extra: Record<string, string> = {}
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(wcUrl(path, extra));
    const data: unknown = await res.json();
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeProduct(p: Record<string, unknown>): Record<string, unknown> {
  // lifespanDays: present on mock products; for WooCommerce products we check
  // meta_data for a "filter_lifespan_days" key, falling back to 365.
  let lifespanDays: number = typeof p["lifespanDays"] === "number" ? p["lifespanDays"] : 365;
  if (Array.isArray(p["meta_data"])) {
    const meta = (p["meta_data"] as Array<{ key: string; value: unknown }>)
      .find(m => m.key === "filter_lifespan_days");
    if (meta && Number(meta.value) > 0) lifespanDays = Number(meta.value);
  }
  return {
    id: p["id"],
    name: p["name"],
    price: p["price"],
    regularPrice: p["regular_price"] ?? p["regularPrice"],
    salePrice: p["sale_price"] ?? p["salePrice"],
    description: p["description"],
    shortDescription: p["short_description"] ?? p["shortDescription"],
    tagline: p["tagline"] ?? p["short_description"] ?? p["shortDescription"] ?? "",
    categories: p["categories"],
    images: p["images"],
    sku: p["sku"],
    stockStatus: p["stock_status"] ?? p["stockStatus"],
    stockQuantity: p["stock_quantity"] ?? p["stockQuantity"],
    tags: p["tags"],
    lifespanDays,
    enquiryOnly: p["enquiryOnly"] ?? false,
  };
}

function normalizeOrder(o: Record<string, unknown>): Record<string, unknown> {
  const li = Array.isArray(o["line_items"])
    ? (o["line_items"] as Record<string, unknown>[]).map((i) => ({
        productId: i["product_id"],
        name: i["name"],
        quantity: i["quantity"],
        total: i["total"],
      }))
    : [];
  return {
    id: o["id"],
    status: o["status"],
    dateCreated: o["date_created"],
    total: o["total"],
    currency: o["currency"],
    paymentMethod: o["payment_method"],
    shippingAddress: o["shipping"],
    lineItems: li,
  };
}

// ─── Product media overlay ────────────────────────────────────────────────────
// Team-uploaded photos/videos stored in uc_product_media are merged on top of
// the base catalogue (mock or WooCommerce) so extra media survives a future
// switch to the live store. A DB hiccup must never take down the catalogue —
// failures are logged loudly and the base product is served unchanged.
async function fetchProductMediaMap(productIds: number[]): Promise<Map<number, UcProductMedia[]>> {
  const map = new Map<number, UcProductMedia[]>();
  if (productIds.length === 0) return map;
  try {
    const rows = await db
      .select()
      .from(ucProductMediaTable)
      .where(inArray(ucProductMediaTable.productId, productIds))
      .orderBy(asc(ucProductMediaTable.position), asc(ucProductMediaTable.id));
    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(row);
      map.set(row.productId, list);
    }
  } catch (err) {
    logger.error({ err }, "Failed to load product media overlay — serving base catalogue only");
  }
  return map;
}

function applyProductMedia(
  product: Record<string, unknown>,
  media: UcProductMedia[] | undefined,
): Record<string, unknown> {
  const baseImages = (product["images"] as { src: string; alt: string }[] | undefined) ?? [];
  if (!media || media.length === 0) {
    return { ...product, videoUrl: null };
  }
  const photos = media
    .filter((m) => m.type === "photo")
    .map((m) => ({ src: m.url, alt: m.alt || (product["name"] as string) }));
  const video = media.find((m) => m.type === "video");
  return { ...product, images: [...baseImages, ...photos], videoUrl: video?.url ?? null };
}

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/uc/products", async (req: Request, res: Response): Promise<void> => {
  try {
    let payload: Record<string, unknown>[] | null = null;
    if (hasWCCredentials()) {
      const extra: Record<string, string> = { per_page: "50" };
      if (req.query["category"]) extra["category"] = req.query["category"] as string;
      if (req.query["search"]) extra["search"] = req.query["search"] as string;
      const products = await wcFetchArray("/products", extra);
      if (products) payload = products.map(normalizeProduct);
    }
    if (!payload) {
      let data = MOCK_PRODUCTS;
      if (req.query["category"]) {
        const cat = (req.query["category"] as string).toLowerCase();
        data = data.filter((p) => {
          const cats = p["categories"] as { name: string }[] | undefined;
          return cats?.some((c) => c.name.toLowerCase() === cat);
        });
      }
      if (req.query["search"]) {
        const q = (req.query["search"] as string).toLowerCase();
        data = data.filter(
          (p) =>
            (p["name"] as string).toLowerCase().includes(q) ||
            (p["sku"] as string).toLowerCase().includes(q)
        );
      }
      payload = data;
    }
    const mediaMap = await fetchProductMediaMap(payload.map((p) => Number(p["id"])));
    res.json(payload.map((p) => applyProductMedia(p, mediaMap.get(Number(p["id"])))));
  } catch {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/uc/products/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]));
  try {
    let payload: Record<string, unknown> | null = null;
    if (hasWCCredentials()) {
      const product = await wcFetchOne(`/products/${id}`);
      if (product) payload = normalizeProduct(product);
    }
    if (!payload) {
      const product = MOCK_PRODUCTS.find((p) => p["id"] === id);
      if (!product) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      payload = product;
    }
    const mediaMap = await fetchProductMediaMap([id]);
    res.json(applyProductMedia(payload, mediaMap.get(id)));
  } catch {
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
const REVIEW_MAX_MEDIA = 4;

/** Accepts "/objects/…" (raw objectPath), "/api/storage/objects/…",
 *  "/api/uc/product-images/…" or absolute http(s) URLs. Anything else → null. */
function normalizeMediaUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/objects/")) return `/api/storage${raw}`;
  if (raw.startsWith("/api/storage/objects/")) return raw;
  if (raw.startsWith("/api/uc/product-images/")) return raw;
  return null;
}

router.get("/uc/products/:id/reviews", async (req: Request, res: Response): Promise<void> => {
  const productId = parseInt(String(req.params["id"]));
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(ucReviewsTable)
      .where(eq(ucReviewsTable.productId, productId))
      .orderBy(desc(ucReviewsTable.createdAt));
    const count = rows.length;
    const average = count
      ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
      : 0;
    const claims = verifyToken(req.headers["authorization"]);
    const uid = claims ? String(claims.id) : null;
    res.json({
      average,
      count,
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        authorName: r.authorName,
        media: r.media ?? [],
        createdAt: r.createdAt,
        mine: uid !== null && r.userId === uid,
      })),
    });
  } catch (err) {
    logger.error({ err, productId }, "Failed to load reviews");
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.post("/uc/products/:id/reviews", async (req: Request, res: Response): Promise<void> => {
  const claims = verifyToken(req.headers["authorization"]);
  if (!claims) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const productId = parseInt(String(req.params["id"]));
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const { rating, title, body, media } = req.body as {
    rating?: unknown; title?: unknown; body?: unknown;
    media?: { url?: unknown; type?: unknown }[];
  };

  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    res.status(400).json({ error: "Rating must be a whole number from 1 to 5" });
    return;
  }
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length < 3) {
    res.status(400).json({ error: "Please write a few words about the product" });
    return;
  }
  if (text.length > 2000) {
    res.status(400).json({ error: "Review is too long (max 2000 characters)" });
    return;
  }

  const items: ReviewMediaItem[] = [];
  if (media !== undefined) {
    if (!Array.isArray(media) || media.length > REVIEW_MAX_MEDIA) {
      res.status(400).json({ error: `You can attach up to ${REVIEW_MAX_MEDIA} photos/videos` });
      return;
    }
    let videos = 0;
    for (const m of media) {
      const url = normalizeMediaUrl(m?.url);
      const type = m?.type === "video" ? "video" : m?.type === "photo" ? "photo" : null;
      if (!url || !type) {
        res.status(400).json({ error: "Invalid attachment" });
        return;
      }
      if (type === "video" && ++videos > 1) {
        res.status(400).json({ error: "Only one video per review" });
        return;
      }
      items.push({ url, type });
    }
  }
  const reviewMediaError = await verifyUploadedMediaItems(items);
  if (reviewMediaError) {
    res.status(400).json({ error: reviewMediaError });
    return;
  }

  const userId = String(claims.id);
  // Prefer the fresh DB name; fall back to whatever the JWT carries.
  let authorName = [claims.firstName, claims.lastName?.[0] ? `${claims.lastName[0]}.` : ""]
    .filter(Boolean).join(" ") || "Customer";
  try {
    const numericId = Number(userId);
    if (!isNaN(numericId) && numericId > 0 && numericId < 1_000_000_000) {
      const dbUser = await db.query.ucUsersTable.findFirst({ where: eq(ucUsersTable.id, numericId) });
      if (dbUser) {
        authorName = [dbUser.firstName, dbUser.lastName?.[0] ? `${dbUser.lastName[0]}.` : ""]
          .filter(Boolean).join(" ") || "Customer";
      }
    }
  } catch { /* keep JWT-derived name */ }

  try {
    const existing = await db.query.ucReviewsTable.findFirst({
      where: and(eq(ucReviewsTable.productId, productId), eq(ucReviewsTable.userId, userId)),
    });
    if (existing) {
      const [updated] = await db
        .update(ucReviewsTable)
        .set({ rating: stars, title: typeof title === "string" ? title.trim() : "", body: text, media: items, authorName })
        .where(eq(ucReviewsTable.id, existing.id))
        .returning();
      res.json({ ...updated, updated: true });
      return;
    }
    const [row] = await db
      .insert(ucReviewsTable)
      .values({
        productId,
        userId,
        authorName,
        rating: stars,
        title: typeof title === "string" ? title.trim() : "",
        body: text,
        media: items,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err, productId, userId }, "Failed to save review");
    res.status(500).json({ error: "Failed to save review" });
  }
});

// ─── Admin · product media management ─────────────────────────────────────────
function adminEmailList(): string[] {
  return (process.env["UC_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdminRequest(authHeader: string | undefined): Promise<boolean> {
  const claims = verifyToken(authHeader);
  if (!claims) return false;
  // Admin is strictly DB-anchored: the bearer token must resolve to a real
  // registered user row. JWT claims alone are NEVER trusted for admin — the
  // dev login fallback can mint tokens carrying an arbitrary email.
  const numericId = Number(claims.id);
  if (isNaN(numericId) || numericId <= 0 || numericId >= 1_000_000_000) return false;
  try {
    const dbUser = await db.query.ucUsersTable.findFirst({ where: eq(ucUsersTable.id, numericId) });
    if (!dbUser) return false;
    return dbUser.isAdmin || adminEmailList().includes(dbUser.email.toLowerCase());
  } catch {
    return false; // DB unavailable → fail closed
  }
}

// Attach-time verification of uploaded media ---------------------------------
const objectStorage = new ObjectStorageService();
const UPLOADED_MEDIA_PREFIX = "/api/storage/objects/";

/** Presigned PUT URLs cannot bind size or content-type, so whatever the
 *  client actually uploaded must be re-checked here, the moment an object is
 *  attached to a review / ticket / water test / product. Returns an error
 *  message, or null when every attachment checks out. Never throws. */
async function verifyUploadedMediaItems(items: ReviewMediaItem[]): Promise<string | null> {
  for (const item of items) {
    if (!item.url.startsWith(UPLOADED_MEDIA_PREFIX)) continue; // catalogue/external URL — nothing stored to verify
    const objectPath = item.url.slice("/api/storage".length); // "/objects/uploads/<id>"
    if (!objectPath.startsWith("/objects/uploads/")) return "Invalid attachment";
    try {
      const file = await objectStorage.getObjectEntityFile(objectPath);
      const [metadata] = await file.getMetadata();
      const contentType = String(metadata.contentType ?? "");
      const size = Number(metadata.size ?? 0);
      if (item.type === "photo" && !contentType.startsWith("image/")) return "Attachment is not an image";
      if (item.type === "video" && !contentType.startsWith("video/")) return "Attachment is not a video";
      const cap = item.type === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (size <= 0 || size > cap) {
        return `Attachment exceeds the ${Math.round(cap / 1024 / 1024)} MB limit`;
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return "Attachment upload not found — please re-attach it";
      logger.error({ err, url: item.url }, "Failed to verify uploaded media");
      return "Could not verify attachment — please try again";
    }
  }
  return null;
}

/** Normalize an optional array of media URLs from the client. Returns null on
 *  malformed input (wrong shape, too many, or off-whitelist URL). */
function sanitizeMediaUrls(value: unknown, max: number): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) return null;
  const out: string[] = [];
  for (const v of value) {
    const normalized = normalizeMediaUrl(v);
    if (!normalized) return null;
    out.push(normalized);
  }
  return out;
}

router.get("/uc/admin/products/:id/media", async (req: Request, res: Response): Promise<void> => {
  if (!(await isAdminRequest(req.headers["authorization"]))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const productId = parseInt(String(req.params["id"]));
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(ucProductMediaTable)
      .where(eq(ucProductMediaTable.productId, productId))
      .orderBy(asc(ucProductMediaTable.position), asc(ucProductMediaTable.id));
    res.json(rows);
  } catch (err) {
    logger.error({ err, productId }, "Failed to load product media");
    res.status(500).json({ error: "Failed to load product media" });
  }
});

router.post("/uc/admin/products/:id/media", async (req: Request, res: Response): Promise<void> => {
  if (!(await isAdminRequest(req.headers["authorization"]))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const productId = parseInt(String(req.params["id"]));
  if (isNaN(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  const { url, type, alt, position } = req.body as {
    url?: unknown; type?: unknown; alt?: unknown; position?: unknown;
  };
  const normalized = normalizeMediaUrl(url);
  const mediaType = type === "video" ? "video" : type === "photo" ? "photo" : null;
  if (!normalized || !mediaType) {
    res.status(400).json({ error: "A valid url and type ('photo' | 'video') are required" });
    return;
  }
  const adminMediaError = await verifyUploadedMediaItems([{ url: normalized, type: mediaType }]);
  if (adminMediaError) {
    res.status(400).json({ error: adminMediaError });
    return;
  }
  try {
    const [row] = await db
      .insert(ucProductMediaTable)
      .values({
        productId,
        type: mediaType,
        url: normalized,
        alt: typeof alt === "string" ? alt : "",
        position: Number.isInteger(Number(position)) ? Number(position) : 0,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    logger.error({ err, productId }, "Failed to add product media");
    res.status(500).json({ error: "Failed to add product media" });
  }
});

router.delete("/uc/admin/media/:mediaId", async (req: Request, res: Response): Promise<void> => {
  if (!(await isAdminRequest(req.headers["authorization"]))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const mediaId = parseInt(String(req.params["mediaId"]));
  if (isNaN(mediaId)) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  try {
    const deleted = await db
      .delete(ucProductMediaTable)
      .where(eq(ucProductMediaTable.id, mediaId))
      .returning();
    if (deleted.length === 0) {
      res.status(404).json({ error: "Media not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, mediaId }, "Failed to delete product media");
    res.status(500).json({ error: "Failed to delete product media" });
  }
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post("/uc/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  try {
    const wcBase = process.env["WC_BASE_URL"] || "https://www.ucfilters.com";
    const jwtRes = await fetch(`${wcBase}/wp-json/jwt-auth/v1/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: email, password }),
    });
    const jwtData: unknown = await jwtRes.json();
    if (
      jwtData &&
      typeof jwtData === "object" &&
      "token" in jwtData &&
      typeof (jwtData as Record<string, unknown>)["token"] === "string"
    ) {
      const d = jwtData as Record<string, unknown>;
      const displayName = (d["user_display_name"] as string | undefined) ?? "";
      const wcEmail = String(d["user_email"] ?? email).toLowerCase().trim();
      // Re-issue our own signed JWT so it can be verified server-side.
      // The original WC token (signed with the WC secret) is discarded.
      //
      // Principal id: the JWT plugin response carries no numeric user id, so
      // derive a stable per-user id from the (lowercased) email. Offset by 1e9
      // so it can NEVER collide with a uc_users serial id — DB-anchored logic
      // (admin checks, profile lookups) treats ids >= 1e9 as non-DB principals.
      // This also avoids linking Woo logins to same-email app accounts, which
      // would be an account-takeover vector if a Woo email were unverified.
      const wooPrincipalId =
        1_000_000_000 +
        parseInt(createHash("sha256").update(wcEmail).digest("hex").slice(0, 13), 16);
      const wcUser = {
        id: wooPrincipalId,
        email:     wcEmail,
        firstName: displayName.split(" ")[0] ?? "Customer",
        lastName:  displayName.split(" ").slice(1).join(" "),
      };
      res.json({ token: issueToken(wcUser), user: wcUser });
      return;
    }
  } catch { /* fall through to mock */ }

  // WooCommerce auth failed or credentials absent — try our own DB
  if (email && password) {
    try {
      const dbUser = await db.query.ucUsersTable.findFirst({
        where: eq(ucUsersTable.email, email.toLowerCase().trim()),
      });
      if (dbUser) {
        const match = await bcryptjs.compare(password, dbUser.passwordHash);
        if (!match) {
          res.status(401).json({ error: "Invalid credentials" });
          return;
        }
        const user = { id: dbUser.id, email: dbUser.email, phone: dbUser.phone, firstName: dbUser.firstName, lastName: dbUser.lastName };
        res.json({ token: issueToken(user), user });
        return;
      }
    } catch { /* DB unavailable — fall through to ephemeral session */ }

    // No DB record. Development only: allow an ephemeral demo session so the
    // app can be tried before WooCommerce credentials exist. Never in
    // production — it would let anyone mint a token for an arbitrary email.
    if (process.env["NODE_ENV"] !== "production" && password.length >= 6) {
      const name = email.split("@")[0] ?? "customer";
      const mockUser = {
        id:        Date.now(),
        email,
        phone:     "",
        firstName: name.charAt(0).toUpperCase() + name.slice(1),
        lastName:  "Customer",
      };
      res.json({ token: issueToken(mockUser), user: mockUser });
      return;
    }
  }
  res.status(401).json({ error: "Invalid credentials" });
});

router.post("/uc/auth/register", async (req: Request, res: Response): Promise<void> => {
  const { email, phone, password, firstName, lastName, referralCode } = req.body as {
    email?: string;
    phone?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    referralCode?: string;
  };
  if (!email || !phone || !password || !firstName) {
    res.status(400).json({ error: "First name, email, phone number and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  // Basic phone sanity check — must start with + and contain 10-15 digits
  const cleanPhone = phone.replace(/\s/g, "");
  if (!/^\+\d{10,15}$/.test(cleanPhone)) {
    res.status(400).json({ error: "Enter a valid phone number in international format, e.g. +254712345678" });
    return;
  }
  try {
    // Check for duplicate email
    const existing = await db.query.ucUsersTable.findFirst({ where: eq(ucUsersTable.email, email.toLowerCase().trim()) }).catch(() => null);
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    const passwordHash = await bcryptjs.hash(password, 10);
    const [dbUser] = await db.insert(ucUsersTable).values({
      email:    email.toLowerCase().trim(),
      passwordHash,
      phone:    cleanPhone,
      firstName,
      lastName: lastName ?? "",
    }).returning();
    const user = { id: dbUser!.id, email: dbUser!.email, phone: dbUser!.phone, firstName: dbUser!.firstName, lastName: dbUser!.lastName };
    // Store referral association so first-order discount can be applied later
    if (referralCode?.trim()) {
      registerReferralAtSignup(email, referralCode.trim());
    }
    res.json({ token: issueToken(user), user });
  } catch (err) {
    // Fallback: if DB is unavailable, issue a session-only token (not persisted)
    console.error("[register] DB error, issuing ephemeral token:", err);
    const user = { id: Date.now(), email, phone: cleanPhone, firstName, lastName: lastName ?? "" };
    if (referralCode?.trim()) registerReferralAtSignup(email, referralCode.trim());
    res.json({ token: issueToken(user), user });
  }
});

// ─── Customer ─────────────────────────────────────────────────────────────────
router.get("/uc/customer/profile", async (req: Request, res: Response): Promise<void> => {
  const claims = verifyToken(req.headers["authorization"]);
  if (!claims) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  // Try to look up the real user record from the DB
  try {
    const numericId = Number(claims.id);
    if (!isNaN(numericId) && numericId > 0 && numericId < 1_000_000_000) {
      // Looks like a real serial DB id (not a timestamp)
      const dbUser = await db.query.ucUsersTable.findFirst({ where: eq(ucUsersTable.id, numericId) });
      if (dbUser) {
        res.json({
          id: dbUser.id,
          email: dbUser.email,
          phone: dbUser.phone,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          isAdmin: dbUser.isAdmin || adminEmailList().includes(dbUser.email.toLowerCase()),
          billing:  { firstName: dbUser.firstName, lastName: dbUser.lastName, city: "Nairobi", country: "KE", phone: dbUser.phone },
          shipping: { firstName: dbUser.firstName, lastName: dbUser.lastName, city: "Nairobi", country: "KE", phone: dbUser.phone },
        });
        return;
      }
    }
  } catch { /* fall through */ }
  // Fallback: return whatever the JWT carries (for mock/legacy logins)
  res.json({
    id:        claims.id,
    email:     claims.email,
    firstName: claims.firstName ?? "",
    lastName:  claims.lastName  ?? "",
    phone:     "",
    // Fallback identities are not DB-anchored, so they can never be admin
    // (the email in the JWT is client-chosen in dev mode).
    isAdmin:   false,
    billing:   { firstName: claims.firstName ?? "", lastName: claims.lastName ?? "", city: "Nairobi", country: "KE", phone: "" },
    shipping:  { firstName: claims.firstName ?? "", lastName: claims.lastName ?? "", city: "Nairobi", country: "KE", phone: "" },
  });
});

router.patch("/uc/customer/profile", async (req: Request, res: Response): Promise<void> => {
  const claims = verifyToken(req.headers["authorization"]);
  if (!claims) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const { firstName, lastName, phone } = req.body as {
    firstName?: string;
    lastName?:  string;
    phone?:     string;
  };

  if (firstName !== undefined && !firstName.trim()) {
    res.status(400).json({ error: "First name cannot be empty" });
    return;
  }
  if (phone !== undefined && phone !== "") {
    const cleanPhone = phone.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Enter a valid phone number in international format, e.g. +254712345678" });
      return;
    }
  }

  const numericId = Number(claims.id);
  if (isNaN(numericId) || numericId <= 0 || numericId >= 1_000_000_000) {
    res.status(403).json({ error: "Profile update is only available for registered accounts" });
    return;
  }

  const updates: Record<string, string> = {};
  if (firstName !== undefined) updates["firstName"] = firstName.trim();
  if (lastName  !== undefined) updates["lastName"]  = lastName.trim();
  if (phone     !== undefined) updates["phone"]     = phone.replace(/\s/g, "");

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(ucUsersTable)
      .set(updates)
      .where(eq(ucUsersTable.id, numericId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id:        updated.id,
      email:     updated.email,
      phone:     updated.phone,
      firstName: updated.firstName,
      lastName:  updated.lastName,
    });
  } catch (err) {
    console.error("[profile patch] error:", err);
    res.status(500).json({ error: "Failed to update profile. Please try again." });
  }
});

// ─── Payment verification helpers (server-side; called before order creation) ─
async function verifyPaymentOnServer(
  method: string,
  reference: string
): Promise<{ ok: boolean; reason?: string }> {
  // COD requires no pre-payment
  if (method === "cod") return { ok: true };

  if (!reference) return { ok: false, reason: "No payment reference provided" };

  // ── M-Pesa ──
  if (method === "mpesa") {
    const shortcode = process.env["MPESA_SHORTCODE"];
    const passkey = process.env["MPESA_PASSKEY"];
    const key = process.env["MPESA_CONSUMER_KEY"];
    const secret = process.env["MPESA_CONSUMER_SECRET"];
    if (!key || !secret || !shortcode || !passkey) {
      // Mock mode: accept any reference
      return { ok: true };
    }
    try {
      const creds = Buffer.from(`${key}:${secret}`).toString("base64");
      const env = process.env["MPESA_ENV"] === "production" ? "api" : "sandbox";
      const tokenRes = await fetch(
        `https://${env}.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${creds}` } }
      );
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      const token = tokenData.access_token;
      if (!token) return { ok: false, reason: "Failed to get M-Pesa token" };
      const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
      const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
      const qRes = await fetch(`https://${env}.safaricom.co.ke/mpesa/stkpushquery/v1/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: timestamp, CheckoutRequestID: reference }),
      });
      const qData = (await qRes.json()) as Record<string, string>;
      const ok = qData["ResultCode"] === "0";
      return ok ? { ok: true } : { ok: false, reason: qData["ResultDesc"] ?? "M-Pesa not confirmed" };
    } catch {
      return { ok: false, reason: "M-Pesa verification request failed" };
    }
  }

  // ── Stripe ──
  if (method === "stripe") {
    const stripeKey = process.env["STRIPE_SECRET_KEY"];
    if (!stripeKey) {
      // Mock mode: accept any session ID
      return { ok: true };
    }
    try {
      const StripeSDK = await import("stripe");
      const stripe = new StripeSDK.default(stripeKey);
      const session = await stripe.checkout.sessions.retrieve(reference);
      const ok = session.payment_status === "paid";
      return ok ? { ok: true } : { ok: false, reason: `Stripe session status: ${session.payment_status}` };
    } catch (e: unknown) {
      return { ok: false, reason: (e as Error).message };
    }
  }

  // ── Paystack ──
  if (method === "paystack") {
    const secretKey = process.env["PAYSTACK_SECRET_KEY"];
    if (!secretKey) {
      // Mock mode: accept any reference
      return { ok: true };
    }
    try {
      const vRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } }
      );
      const vData = (await vRes.json()) as { status: boolean; data?: { status: string } };
      const ok = vData.status && vData.data?.status === "success";
      return ok ? { ok: true } : { ok: false, reason: `Paystack status: ${vData.data?.status ?? "unknown"}` };
    } catch {
      return { ok: false, reason: "Paystack verification request failed" };
    }
  }

  return { ok: false, reason: `Unknown payment method: ${method}` };
}

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get("/uc/orders", async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromBearer(req.headers["authorization"]);
  try {
    if (hasWCCredentials()) {
      const orders = await wcFetchArray("/orders", { per_page: "20", orderby: "date", order: "desc" });
      if (orders) {
        res.json(orders.map(normalizeOrder));
        return;
      }
    }
    // DB path: fetch this user's orders with their line items
    const orders = await db.select().from(ucOrdersTable)
      .where(eq(ucOrdersTable.userId, userId))
      .orderBy(desc(ucOrdersTable.dateCreated));
    if (orders.length === 0) {
      res.json([]);
      return;
    }
    const orderIds = orders.map(o => o.id);
    const items = await db.select().from(ucOrderItemsTable)
      .where(inArray(ucOrderItemsTable.orderId, orderIds));
    const itemsByOrder = items.reduce<Record<number, typeof items>>((acc, item) => {
      (acc[item.orderId] ??= []).push(item);
      return acc;
    }, {});
    res.json(orders.map(o => ({
      id:              o.id,
      status:          o.status,
      dateCreated:     o.dateCreated,
      total:           o.total,
      currency:        o.currency,
      paymentMethod:   o.paymentMethod,
      shippingAddress: o.shippingAddress ?? {},
      discountPercent: o.discountPercent,
      discountAmount:  o.discountAmount,
      promoCode:       o.promoCode ?? "",
      lineItems:       (itemsByOrder[o.id] ?? []).map(i => ({
        productId: i.productId,
        name:      i.name,
        quantity:  i.quantity,
        total:     i.total,
      })),
    })));
  } catch {
    res.json(orderStoreFallback.filter(o => (o as Record<string,unknown>)["userId"] === userId));
  }
});

// ─── Push notifications infrastructure ──────────────────────────────────────

/**
 * Verify the Bearer JWT and return a stable user-identity string.
 * Returns "anonymous" when the token is absent, invalid, or unsigned.
 */
function userIdFromBearer(authHeader: string | undefined): string {
  const claims = verifyToken(authHeader);
  if (!claims) return "anonymous";
  return String(claims.id ?? claims.email ?? "anonymous");
}

/** Retrieve a user's push token row from the database. Returns null if not found. */
async function getPushTokenRow(userId: string): Promise<{ pushToken: string; optOutOrders: boolean } | null> {
  try {
    const row = await db.query.ucPushTokensTable.findFirst({
      where: eq(ucPushTokensTable.userId, userId),
    });
    if (!row) return null;
    return { pushToken: row.pushToken, optOutOrders: row.optOutOrders };
  } catch {
    return null;
  }
}

/** Remove a stale / unregistered token from the database. */
async function removePushToken(userId: string): Promise<void> {
  try {
    await db.delete(ucPushTokensTable).where(eq(ucPushTokensTable.userId, userId));
  } catch { /* ignore */ }
}

/**
 * Send a single push notification via the Expo Push API.
 * Returns true if the token is stale (DeviceNotRegistered) so the caller
 * can clean it up.
 */
async function callExpoPushApi(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<{ staleToken: boolean }> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Accept":          "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify([{ to: token, title, body, data }]),
  });
  try {
    const json = await res.json() as { data?: Array<{ status: string; details?: { error?: string } }> };
    const ticket = json?.data?.[0];
    if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
      return { staleToken: true };
    }
  } catch { /* response body parse error — not a stale token */ }
  return { staleToken: false };
}

/**
 * Look up the registered push token for a user from the DB and fire a notification.
 * Fire-and-forget: failures are swallowed so they never block the caller.
 * Automatically removes stale tokens that Expo reports as unregistered.
 */
/**
 * Send a push notification to a user, respecting their opt-out preferences.
 * `category` controls which opt-out flag is checked:
 *   - "orders": checked against optOutOrders
 */
function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  category: "orders" | "general" = "general"
): void {
  getPushTokenRow(userId).then(async (row) => {
    if (!row) return;
    if (category === "orders" && row.optOutOrders) return;
    const { staleToken } = await callExpoPushApi(row.pushToken, title, body, data);
    if (staleToken) await removePushToken(userId);
  }).catch(() => { /* ignore */ });
}

// ─── Contact lookup helper ────────────────────────────────────────────────────
/** Look up phone, email, and firstName for a registered DB user. Returns null
 *  for mock/legacy string ids (timestamps) or when the DB is unavailable. */
async function getUserContact(
  userId: string,
): Promise<{ phone: string; email: string; firstName: string } | null> {
  const numericId = Number(userId);
  if (isNaN(numericId) || numericId <= 0 || numericId >= 1_000_000_000) return null;
  try {
    const row = await db.query.ucUsersTable.findFirst({
      where: eq(ucUsersTable.id, numericId),
    });
    if (!row) return null;
    return { phone: row.phone, email: row.email, firstName: row.firstName };
  } catch {
    return null;
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────
router.post("/uc/orders", async (req: Request, res: Response): Promise<void> => {
  // Capture the caller's identity up-front so we can send a push notification
  // after the order is created without re-parsing the header each time.
  const orderUserId = userIdFromBearer(req.headers["authorization"]);

  const { lineItems, paymentMethod, paymentReference, shippingAddress, promoCode, userEmail } =
    req.body as {
      lineItems: { productId: number; quantity: number }[];
      paymentMethod: string;
      paymentReference?: string;
      shippingAddress?: Record<string, string>;
      promoCode?: string;            // referral or promotion code
      userEmail?: string;            // used to gate referral first-order discount
    };
  if (!lineItems || !paymentMethod) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Server-side payment verification — gate order creation on confirmed payment.
  const verification = await verifyPaymentOnServer(paymentMethod, paymentReference ?? "");
  if (!verification.ok) {
    res.status(402).json({ error: "Payment not verified", reason: verification.reason });
    return;
  }

  // Resolve discount from promo/referral code (server re-validates; client cannot fake this)
  let discountPercent = 0;
  let discountType: "referral" | "promotion" | null = null;
  if (promoCode?.trim()) {
    const validation = validateCodeForDiscount(promoCode.trim(), userEmail ?? "");
    if (validation.valid) {
      discountPercent = validation.discountPercent;
      discountType = validation.type;
    }
  }

  const isPaid = paymentMethod !== "cod";

  // Compute order total after discount (500 KES delivery already included by client)
  const productLines = lineItems.map((i) => {
    const p = MOCK_PRODUCTS.find((m) => m["id"] === i.productId);
    const price = parseFloat((p?.["price"] as string | undefined) ?? "0");
    return {
      productId: i.productId,
      name: (p?.["name"] as string | undefined) ?? "Product",
      quantity: i.quantity,
      subtotal: price * i.quantity,
    };
  });
  const subtotal = productLines.reduce((s, i) => s + i.subtotal, 0);
  const delivery = 500;
  const gross = subtotal + delivery;
  const discountAmount = Math.round((gross * discountPercent) / 100);
  const netTotal = gross - discountAmount;

  try {
    if (hasWCCredentials()) {
      const orderPayload = {
        payment_method: paymentMethod,
        payment_method_title:
          paymentMethod === "mpesa" ? "M-Pesa" :
          paymentMethod === "stripe" ? "Credit Card (Stripe)" :
          paymentMethod === "paystack" ? "Paystack" : "Cash on Delivery",
        set_paid: isPaid,
        shipping: shippingAddress,
        line_items: lineItems.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        meta_data: [
          { key: "payment_reference", value: paymentReference ?? "" },
          { key: "promo_code", value: promoCode ?? "" },
          { key: "discount_percent", value: String(discountPercent) },
        ],
        coupon_lines: discountPercent > 0 && promoCode ? [{ code: promoCode }] : [],
      };
      const orderRes = await fetch(wcUrl("/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const order: unknown = await orderRes.json();
      if (order && typeof order === "object" && "id" in order) {
        if (discountType === "referral" && promoCode && userEmail) {
          recordReferralConversion(promoCode, userEmail);
        }
        const normalized = normalizeOrder(order as Record<string, unknown>);
        // Server-side push notification: order confirmed (fire-and-forget)
        sendPushToUser(
          orderUserId,
          "✅ Order confirmed!",
          `Your order #${normalized["id"] ?? "–"} is being processed.`,
          { screen: "orders", orderId: String(normalized["id"] ?? "") },
          "orders"
        );
        // SMS + email confirmations (fire-and-forget)
        getUserContact(orderUserId).then(contact => {
          if (contact?.phone) {
            sendSms(contact.phone, orderConfirmationSms({
              orderId:   normalized["id"] as string | number,
              total:     String(normalized["total"] ?? "0"),
              firstName: contact.firstName,
            }));
          }
          if (contact?.email) {
            const li = (normalized["lineItems"] as Array<{ name: string; quantity: number; total: string }> | undefined) ?? [];
            const receipt = buildOrderReceiptEmail({
              orderId:         normalized["id"] as string | number,
              firstName:       contact.firstName,
              email:           contact.email,
              lineItems:       li,
              total:           String(normalized["total"] ?? "0"),
              currency:        String(normalized["currency"] ?? "KES"),
              paymentMethod:   String(normalized["paymentMethod"] ?? ""),
              shippingAddress: normalized["shippingAddress"] as Record<string, string> | undefined,
            });
            sendEmail({ to: contact.email, ...receipt });
          }
        }).catch(() => {});
        res.json(normalized);
        return;
      }
    }
  } catch { /* fall through to mock */ }

  // Persist order to DB
  try {
    const [dbOrder] = await db.insert(ucOrdersTable).values({
      userId:           orderUserId,
      status:           paymentMethod === "cod" ? "pending" : "processing",
      total:            String(netTotal),
      currency:         "KES",
      paymentMethod,
      paymentReference: paymentReference ?? "",
      promoCode:        promoCode ?? "",
      discountPercent,
      discountAmount,
      shippingAddress:  shippingAddress ?? {},
    }).returning();

    if (dbOrder && productLines.length > 0) {
      await db.insert(ucOrderItemsTable).values(
        productLines.map(({ productId, name, quantity, subtotal: t }) => ({
          orderId:   dbOrder.id,
          productId,
          name,
          quantity,
          total:     String(t),
        }))
      );
    }

    // Record referral conversion so the referrer earns credit
    if (discountType === "referral" && promoCode && userEmail) {
      recordReferralConversion(promoCode, userEmail);
    }

    const newOrder = {
      id:              dbOrder!.id,
      status:          dbOrder!.status,
      dateCreated:     dbOrder!.dateCreated,
      total:           dbOrder!.total,
      currency:        dbOrder!.currency,
      paymentMethod:   dbOrder!.paymentMethod,
      shippingAddress: dbOrder!.shippingAddress ?? {},
      discountPercent,
      discountAmount,
      promoCode:       promoCode ?? "",
      lineItems:       productLines.map(({ productId, name, quantity, subtotal: t }) => ({
        productId, name, quantity, total: String(t),
      })),
    };

    sendPushToUser(
      orderUserId,
      "✅ Order confirmed!",
      `Your order #${newOrder.id} is placed and being processed.`,
      { screen: "orders", orderId: String(newOrder.id) },
      "orders"
    );
    // SMS + email confirmations (fire-and-forget)
    getUserContact(orderUserId).then(contact => {
      if (contact?.phone) {
        sendSms(contact.phone, orderConfirmationSms({
          orderId:   newOrder.id,
          total:     newOrder.total,
          firstName: contact.firstName,
        }));
      }
      if (contact?.email) {
        const receipt = buildOrderReceiptEmail({
          orderId:         newOrder.id,
          firstName:       contact.firstName,
          email:           contact.email,
          lineItems:       newOrder.lineItems,
          total:           newOrder.total,
          currency:        newOrder.currency,
          paymentMethod:   newOrder.paymentMethod,
          shippingAddress: newOrder.shippingAddress as Record<string, string> | undefined,
          discountAmount:  newOrder.discountAmount,
          promoCode:       newOrder.promoCode,
        });
        sendEmail({ to: contact.email, ...receipt });
      }
    }).catch(() => {});

    res.json(newOrder);
  } catch (dbErr) {
    // DB unavailable — fall back to in-memory so the order is not lost in the response
    console.error("[orders] DB insert failed, using fallback:", dbErr);
    const fallbackOrder = {
      id:          Date.now(),
      status:      paymentMethod === "cod" ? "pending" : "processing",
      dateCreated: new Date().toISOString(),
      total:       String(netTotal),
      currency:    "KES",
      userId:      orderUserId,
      lineItems:   productLines.map(({ productId, name, quantity, subtotal: t }) => ({
        productId, name, quantity, total: String(t),
      })),
      paymentMethod,
      shippingAddress: shippingAddress ?? {},
      discountPercent,
      discountAmount,
      promoCode:   promoCode ?? "",
    };
    orderStoreFallback.push(fallbackOrder);
    if (discountType === "referral" && promoCode && userEmail) {
      recordReferralConversion(promoCode, userEmail);
    }
    sendPushToUser(
      orderUserId,
      "✅ Order confirmed!",
      `Your order #${fallbackOrder.id} is placed and being processed.`,
      { screen: "orders", orderId: String(fallbackOrder.id) },
      "orders"
    );
    // SMS + email confirmations (fire-and-forget, fallback path)
    getUserContact(orderUserId).then(contact => {
      if (contact?.phone) {
        sendSms(contact.phone, orderConfirmationSms({
          orderId:   fallbackOrder.id,
          total:     fallbackOrder.total,
          firstName: contact.firstName,
        }));
      }
      if (contact?.email) {
        const receipt = buildOrderReceiptEmail({
          orderId:         fallbackOrder.id,
          firstName:       contact.firstName,
          email:           contact.email,
          lineItems:       fallbackOrder.lineItems,
          total:           fallbackOrder.total,
          currency:        fallbackOrder.currency,
          paymentMethod:   fallbackOrder.paymentMethod,
          shippingAddress: fallbackOrder.shippingAddress as Record<string, string> | undefined,
          discountAmount:  fallbackOrder.discountAmount,
          promoCode:       fallbackOrder.promoCode,
        });
        sendEmail({ to: contact.email, ...receipt });
      }
    }).catch(() => {});
    res.json(fallbackOrder);
  }
});

// ─── Push notification endpoints ─────────────────────────────────────────────

/**
 * POST /api/uc/notify/register
 * Authenticated — stores the caller's Expo push token in the server-side map.
 * The token is keyed by the user ID extracted from the Bearer JWT, so only
 * the authenticated user's own token is ever registered here.
 */
router.post("/uc/notify/register", async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromBearer(req.headers["authorization"]);
  if (userId === "anonymous") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const { pushToken } = req.body as { pushToken?: string };
  if (!pushToken) {
    res.status(400).json({ error: "pushToken required" });
    return;
  }
  try {
    // Check whether this user already has saved notification preferences so we
    // can carry them over into the push token row (handles the case where the
    // user opted out before granting push permission).
    const existingPrefs = await db.query.ucNotifPrefsTable
      .findFirst({ where: eq(ucNotifPrefsTable.userId, userId) })
      .catch(() => null);

    await db
      .insert(ucPushTokensTable)
      .values({
        userId,
        pushToken,
        optOutOrders: existingPrefs?.optOutOrders ?? false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: ucPushTokensTable.userId,
        set: {
          pushToken,
          // Preserve the opt-out flag from the prefs table if available; otherwise
          // keep whatever was already stored (don't reset an existing opt-out).
          ...(existingPrefs != null ? { optOutOrders: existingPrefs.optOutOrders } : {}),
          updatedAt: new Date(),
        },
      });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to register push token", detail: String(err) });
  }
});

/**
 * POST /api/uc/notify/prefs
 * Authenticated — upserts the caller's server-side notification opt-out flags.
 * Works even when no push token has been registered yet: prefs are stored in
 * uc_notif_prefs and synced into uc_push_tokens the next time a token is
 * registered, so user opt-outs are never silently lost.
 * Body: { optOutOrders?: boolean }
 */
router.post("/uc/notify/prefs", async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromBearer(req.headers["authorization"]);
  if (userId === "anonymous") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const { optOutOrders } = req.body as { optOutOrders?: boolean };
  const value = optOutOrders ?? false;
  try {
    // Upsert into the dedicated prefs table — always works, even without a push token row.
    await db
      .insert(ucNotifPrefsTable)
      .values({ userId, optOutOrders: value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: ucNotifPrefsTable.userId,
        set: { optOutOrders: value, updatedAt: new Date() },
      });
    // Best-effort: also sync to the push token row if one exists so sendPushToUser
    // can use a single-table lookup.
    await db
      .update(ucPushTokensTable)
      .set({ optOutOrders: value })
      .where(eq(ucPushTokensTable.userId, userId));
    res.json({ ok: true, created: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update preferences", detail: String(err) });
  }
});

/**
 * POST /api/uc/notify
 * Authenticated — sends a push notification to the authenticated user's
 * registered device.  The server resolves the recipient token from the
 * registered store; clients never supply a raw destination token.
 *
 * Body: { title: string, body?: string, data?: object }
 */
router.post("/uc/notify", async (req: Request, res: Response): Promise<void> => {
  // Require authentication — no unauthenticated push relay
  const userId = userIdFromBearer(req.headers["authorization"]);
  if (userId === "anonymous") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokenRow = await getPushTokenRow(userId);
  if (!tokenRow) {
    res.status(404).json({ error: "No push token registered for this account" });
    return;
  }
  const token = tokenRow.pushToken;

  const { title, body, data } = req.body as {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  };
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    const { staleToken } = await callExpoPushApi(token, title, body ?? "", data ?? {});
    if (staleToken) {
      await removePushToken(userId);
      res.status(410).json({ error: "Push token is no longer valid — device has unregistered" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Push notification failed", detail: String(err) });
  }
});

// ─── Enquiries ────────────────────────────────────────────────────────────────

// ─── Office notifications ─────────────────────────────────────────────────────

/** Official office inbox for all customer form submissions. */
const OFFICE_EMAIL = "sales@ucfilters.com";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Send a plain-text form-submission email to the office inbox (sales@ucfilters.com).
 * Prefers the Resend API when RESEND_API_KEY is set; falls back to the
 * SendGrid/SMTP chain in lib/email when Resend is unconfigured or returns an
 * error. Fire-and-forget — never throws. Logs only the subject/request id,
 * never the form payload (it contains customer PII; the submission itself is
 * already persisted in the database).
 */
export async function notifyOffice(subject: string, lines: string[]): Promise<void> {
  const text = lines.join("\n");
  const apiKey = process.env["RESEND_API_KEY"];
  if (apiKey) {
    try {
      const resp = await fetch(`${process.env["RESEND_BASE_URL"] ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          from: "Ultra Clear App <noreply@ucfilters.com>",
          to: OFFICE_EMAIL,
          subject,
          text,
        }),
      });
      if (resp.ok) return;
      console.error(`[office-notify] Resend responded ${resp.status} for "${subject}" — falling back to SendGrid/SMTP`);
    } catch (err) {
      console.error(`[office-notify] Resend failed for "${subject}" — falling back to SendGrid/SMTP:`, err instanceof Error ? err.message : err);
    }
  }
  try {
    await sendEmail({
      to: OFFICE_EMAIL,
      subject,
      text,
      html: `<pre style="font-family:monospace">${escapeHtml(text)}</pre>`,
    });
  } catch (err) {
    console.error(`[office-notify] email failed for "${subject}":`, err instanceof Error ? err.message : err);
  }
}

/**
 * Send a plain-text notification email to info@ucfilters.com via the Resend API.
 * No-ops when RESEND_API_KEY is absent — falls back to a console log so the
 * team can see the submission in server logs.
 */
async function sendEnquiryEmail(enquiry: {
  productName: string;
  name: string;
  email: string;
  phone: string;
  message: string;
}): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    console.info("[enquiry] No RESEND_API_KEY — logging submission:", enquiry);
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: "Ultra Clear App <noreply@ucfilters.com>",
        to: "info@ucfilters.com",
        subject: `New Enquiry: ${enquiry.productName}`,
        text: [
          `Product: ${enquiry.productName}`,
          `Name:    ${enquiry.name}`,
          `Email:   ${enquiry.email}`,
          `Phone:   ${enquiry.phone}`,
          "",
          enquiry.message,
        ].join("\n"),
      }),
    });
  } catch { /* fire-and-forget — never block the response */ }
}

/** In-memory fallback when the DB insert fails (e.g. table not yet created). */
const enquiryStoreFallback: Record<string, unknown>[] = [];

router.post("/uc/enquiries", async (req: Request, res: Response): Promise<void> => {
  const { productId, productName, name, email, phone, message } = req.body as {
    productId?: number;
    productName?: string;
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
  };
  if (!productId || !productName || !name || !email || !phone || !message) {
    res.status(400).json({ error: "All fields are required" });
    return;
  }

  const userId = userIdFromBearer(req.headers["authorization"]);

  try {
    await db.insert(ucEnquiriesTable).values({
      userId: userId === "anonymous" ? null : userId,
      productId: String(productId),
      productName,
      name,
      email,
      phone,
      message,
    });
  } catch {
    // DB not yet available — store in memory so we don't lose the lead
    enquiryStoreFallback.push({
      productId, productName, name, email, phone, message,
      createdAt: new Date().toISOString(),
    });
  }

  // Fire-and-forget email notification
  sendEnquiryEmail({ productName, name, email, phone, message }).catch(() => {});

  res.status(201).json({
    ok: true,
    message: "Enquiry received. We'll be in touch within 24 hours.",
  });
});

// ─── Locations ────────────────────────────────────────────────────────────────
router.get("/uc/locations", (_req: Request, res: Response): void => {
  res.json(MOCK_LOCATIONS);
});

// ─── Tickets ──────────────────────────────────────────────────────────────────
router.get("/uc/tickets", async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromBearer(req.headers["authorization"]);
  try {
    const tickets = await db.select().from(ucTicketsTable)
      .where(eq(ucTicketsTable.userId, userId))
      .orderBy(desc(ucTicketsTable.createdAt));
    res.json(tickets);
  } catch {
    res.json(ticketStoreFallback.filter(t => (t as Record<string,unknown>)["userId"] === userId));
  }
});

router.post("/uc/tickets", async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromBearer(req.headers["authorization"]);
  const { productModel, issueDescription, preferredContactTime, photos, videos } = req.body as {
    productModel?: string;
    issueDescription?: string;
    preferredContactTime?: string;
    photos?: string[];
    videos?: string[];
  };
  if (!productModel || !issueDescription) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const photoList = sanitizeMediaUrls(photos, 6);
  const videoList = sanitizeMediaUrls(videos, 2);
  if (photoList === null || videoList === null) {
    res.status(400).json({ error: "Invalid attachment" });
    return;
  }
  const ticketMediaError = await verifyUploadedMediaItems([
    ...photoList.map((u) => ({ url: u, type: "photo" as const })),
    ...videoList.map((u) => ({ url: u, type: "video" as const })),
  ]);
  if (ticketMediaError) {
    res.status(400).json({ error: ticketMediaError });
    return;
  }
  const id = `TKT-${Date.now()}`;
  try {
    const [ticket] = await db.insert(ucTicketsTable).values({
      id,
      userId,
      productModel,
      issueDescription,
      preferredContactTime: preferredContactTime ?? "Any time",
      photos: photoList,
      videos: videoList,
    }).returning();
    // SMS + email confirmation (fire-and-forget)
    getUserContact(userId).then(contact => {
      if (contact?.phone) {
        sendSms(contact.phone, ticketConfirmationSms({ ticketId: ticket.id, firstName: contact.firstName }));
      }
      if (contact?.email) {
        const receipt = buildTicketConfirmationEmail({
          ticketId: ticket.id, firstName: contact.firstName, email: contact.email,
          productModel: ticket.productModel, issueDescription: ticket.issueDescription,
        });
        sendEmail({ to: contact.email, ...receipt });
      }
      // Full form copy to the office inbox
      notifyOffice(`New Service Request ${ticket.id}: ${ticket.productModel}`, [
        `Ticket:        ${ticket.id}`,
        `Product:       ${ticket.productModel}`,
        `Issue:         ${ticket.issueDescription}`,
        `Contact time:  ${ticket.preferredContactTime}`,
        `Customer:      ${contact ? `${contact.firstName ?? ""} ${contact.email ?? ""} ${contact.phone ?? ""}`.trim() : "(guest)"}`,
        ...(photoList.length ? [`Photos:        ${photoList.join(", ")}`] : []),
        ...(videoList.length ? [`Videos:        ${videoList.join(", ")}`] : []),
      ]).catch(() => {});
    }).catch(() => {});
    res.status(201).json(ticket);
  } catch (err) {
    console.error("[tickets] DB insert failed, using fallback:", err);
    const fallback = {
      id, userId, productModel, issueDescription,
      preferredContactTime: preferredContactTime ?? "Any time",
      photos: photoList,
      videos: videoList,
      status: "submitted",
      createdAt: new Date().toISOString(),
    };
    ticketStoreFallback.push(fallback);
    // SMS + email confirmation (fire-and-forget, fallback path)
    getUserContact(userId).then(contact => {
      if (contact?.phone) {
        sendSms(contact.phone, ticketConfirmationSms({ ticketId: id, firstName: contact.firstName }));
      }
      if (contact?.email) {
        const receipt = buildTicketConfirmationEmail({
          ticketId: id, firstName: contact.firstName, email: contact.email,
          productModel: productModel ?? "", issueDescription: issueDescription ?? "",
        });
        sendEmail({ to: contact.email, ...receipt });
      }
      // Full form copy to the office inbox
      notifyOffice(`New Service Request ${id}: ${productModel}`, [
        `Ticket:        ${id}`,
        `Product:       ${productModel}`,
        `Issue:         ${issueDescription}`,
        `Contact time:  ${preferredContactTime ?? "Any time"}`,
        `Customer:      ${contact ? `${contact.firstName ?? ""} ${contact.email ?? ""} ${contact.phone ?? ""}`.trim() : "(guest)"}`,
        ...(photoList.length ? [`Photos:        ${photoList.join(", ")}`] : []),
        ...(videoList.length ? [`Videos:        ${videoList.join(", ")}`] : []),
      ]).catch(() => {});
    }).catch(() => {});
    res.status(201).json(fallback);
  }
});

// ─── Water Tests ──────────────────────────────────────────────────────────────
router.post("/uc/water-tests", async (req: Request, res: Response): Promise<void> => {
  const userId = userIdFromBearer(req.headers["authorization"]);
  const { name, address, phone, waterSource, concerns, photos, videos } = req.body as {
    name?: string;
    address?: string;
    phone?: string;
    waterSource?: string;
    concerns?: string;
    photos?: string[];
    videos?: string[];
  };
  if (!name || !address || !phone) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const photoList = sanitizeMediaUrls(photos, 6);
  const videoList = sanitizeMediaUrls(videos, 2);
  if (photoList === null || videoList === null) {
    res.status(400).json({ error: "Invalid attachment" });
    return;
  }
  const wtMediaError = await verifyUploadedMediaItems([
    ...photoList.map((u) => ({ url: u, type: "photo" as const })),
    ...videoList.map((u) => ({ url: u, type: "video" as const })),
  ]);
  if (wtMediaError) {
    res.status(400).json({ error: wtMediaError });
    return;
  }
  const id = `WT-${Date.now()}`;
  try {
    const [wt] = await db.insert(ucWaterTestsTable).values({
      id,
      userId,
      name,
      address,
      phone,
      waterSource: waterSource ?? "Municipal",
      concerns:    concerns ?? "",
      photos:      photoList,
      videos:      videoList,
    }).returning();
    // SMS + email confirmation — phone submitted in form (fire-and-forget)
    const firstName = name.split(" ")[0] ?? name;
    sendSms(phone, waterTestConfirmationSms({ testId: wt.id, address, firstName }));
    // Full form copy to the office inbox
    notifyOffice(`New Water Test Request ${wt.id}: ${name}`, [
      `Request:      ${wt.id}`,
      `Name:         ${name}`,
      `Phone:        ${phone}`,
      `Address:      ${address}`,
      `Water source: ${waterSource ?? "Municipal"}`,
      `Concerns:     ${concerns || "(none given)"}`,
      ...(photoList.length ? [`Photos:       ${photoList.join(", ")}`] : []),
      ...(videoList.length ? [`Videos:       ${videoList.join(", ")}`] : []),
    ]).catch(() => {});
    getUserContact(userId).then(contact => {
      if (contact?.email) {
        const receipt = buildWaterTestConfirmationEmail({
          testId: wt.id, firstName: contact.firstName, email: contact.email,
          address, waterSource: waterSource ?? "Municipal", concerns: concerns ?? "",
        });
        sendEmail({ to: contact.email, ...receipt });
      }
    }).catch(() => {});
    res.status(201).json(wt);
  } catch (err) {
    console.error("[water-tests] DB insert failed, using fallback:", err);
    const fallback = {
      id, userId, name, address, phone,
      waterSource: waterSource ?? "Municipal",
      concerns:    concerns ?? "",
      photos:      photoList,
      videos:      videoList,
      status:      "pending",
      createdAt:   new Date().toISOString(),
    };
    waterTestStoreFallback.push(fallback);
    // SMS + email confirmation (fire-and-forget, fallback path)
    const firstName2 = name.split(" ")[0] ?? name;
    sendSms(phone, waterTestConfirmationSms({ testId: id, address, firstName: firstName2 }));
    // Full form copy to the office inbox
    notifyOffice(`New Water Test Request ${id}: ${name}`, [
      `Request:      ${id}`,
      `Name:         ${name}`,
      `Phone:        ${phone}`,
      `Address:      ${address}`,
      `Water source: ${waterSource ?? "Municipal"}`,
      `Concerns:     ${concerns || "(none given)"}`,
      ...(photoList.length ? [`Photos:       ${photoList.join(", ")}`] : []),
      ...(videoList.length ? [`Videos:       ${videoList.join(", ")}`] : []),
    ]).catch(() => {});
    getUserContact(userId).then(contact => {
      if (contact?.email) {
        const receipt = buildWaterTestConfirmationEmail({
          testId: id, firstName: contact.firstName, email: contact.email,
          address, waterSource: waterSource ?? "Municipal", concerns: concerns ?? "",
        });
        sendEmail({ to: contact.email, ...receipt });
      }
    }).catch(() => {});
    res.status(201).json(fallback);
  }
});

export default router;
