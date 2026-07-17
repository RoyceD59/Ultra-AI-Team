import { Router, type Request, type Response } from "express";
import {
  validateCodeForDiscount,
  recordReferralConversion,
  registerReferralAtSignup,
} from "./referrals";
import { issueToken, verifyToken } from "../lib/jwt.js";

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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Hydra+Flux", alt: "Hydra Flux" }],
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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Truva+Go", alt: "Truva Go" }],
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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Viva+Drop", alt: "Viva Drop" }],
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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Flex", alt: "Flex" }],
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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Timbo", alt: "Timbo" }],
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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Gym+Buddy", alt: "Gym Buddy" }],
    stockStatus: "instock", stockQuantity: 20,
    tags: [],
  },
  {
    id: 7, name: "Survivor Straw", sku: "UC-STR-SVV-007",
    price: "1299", regularPrice: "1299", salePrice: "",
    lifespanDays: 90,
    tagline: "Drink safe from any source.",
    description: "Portable emergency filter straw. SGS-certified filtration — drink directly from streams, taps, or any water source. Lightweight and compact. Filter: 300L or 3 months — whichever comes first.",
    shortDescription: "Portable certified emergency filter straw",
    categories: [CAT_BOTTLES],
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Survivor+Straw", alt: "Survivor Straw" }],
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
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=Breeze", alt: "Breeze" }],
    stockStatus: "instock", stockQuantity: 45,
    tags: [],
  },
  {
    id: 9, name: "EcoSmart Elite", sku: "UC-ESE-ELT-009",
    price: "9799", regularPrice: "9799", salePrice: "",
    lifespanDays: 120,
    tagline: "Solar. Electric. Always clean.",
    description: "Advanced portable filter with solar charging, electric pump, and built-in power bank. Multi-stage filtration: Nylon Mesh, UF Membrane 0.01µm, Ahlstrom Disruptor®, Carbon Block. Filter: 400L or 4 months.",
    shortDescription: "Solar-powered certified portable filter with power bank",
    categories: [CAT_BOTTLES],
    images: [{ src: "https://placehold.co/400x400/0D4FA8/FFFFFF/png?text=EcoSmart+Elite", alt: "EcoSmart Elite" }],
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
    images: [{ src: "https://placehold.co/400x400/005D8F/FFFFFF/png?text=Sweet+Home", alt: "Sweet Home" }],
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
    images: [{ src: "https://placehold.co/400x400/005D8F/FFFFFF/png?text=Counter+RO", alt: "Counter Reverse Osmosis" }],
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
    images: [{ src: "https://placehold.co/400x400/005D8F/FFFFFF/png?text=Electric+Pitcher", alt: "Electric Pitcher" }],
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
    images: [{ src: "https://placehold.co/400x400/005D8F/FFFFFF/png?text=RO+Home", alt: "RO Home System" }],
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
    images: [{ src: "https://placehold.co/400x400/52B6DC/FFFFFF/png?text=J'adore", alt: "J'adore" }],
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
    images: [{ src: "https://placehold.co/400x400/52B6DC/FFFFFF/png?text=Channel", alt: "Channel" }],
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
    images: [{ src: "https://placehold.co/400x400/52B6DC/FFFFFF/png?text=Derma+Care", alt: "Derma Care" }],
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
    images: [{ src: "https://placehold.co/400x400/52B6DC/FFFFFF/png?text=Pure+Drop", alt: "Pure Drop" }],
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
    images: [{ src: "https://placehold.co/400x400/52B6DC/FFFFFF/png?text=Derma+Flux", alt: "Derma Flux" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Gift+Sets", alt: "Gift Sets" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Sleeve", alt: "Bottle Carry Sleeve" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Bottle+Cartridge", alt: "Bottle Filter Cartridge" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Faucet+Cartridge", alt: "Faucet Filter Cartridge" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Shower+Cartridge", alt: "Shower Filter Cartridge" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Derma+Flux+Cart", alt: "Derma Flux Cartridge" }],
    stockStatus: "instock", stockQuantity: 40,
    tags: [{ name: "replacement" }],
  },
  {
    id: 26, name: "Survivor Straw Cartridge", sku: "UC-BOG-FCS-017",
    price: "499", regularPrice: "499", salePrice: "",
    lifespanDays: 90,
    tagline: "Renew the straw. Restore the protection.",
    description: "Genuine replacement filter cartridge for the Ultra Clear Survivor Straw. Restores full SGS-certified filtration performance. Compact, lightweight, and easy to swap in the field. Replace when flow slows or after ~300 litres / 3 months.",
    shortDescription: "Genuine replacement cartridge for Survivor Straw",
    categories: [CAT_ACCESS],
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Straw+Cartridge", alt: "Survivor Straw Cartridge" }],
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
    images: [{ src: "https://placehold.co/400x400/1A6FD4/FFFFFF/png?text=Filter+Shell", alt: "Filter Shell" }],
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
    images: [{ src: "https://placehold.co/400x400/083060/FFFFFF/png?text=Aqua+Stream+1200", alt: "Aqua Stream 1200" }],
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
    images: [{ src: "https://placehold.co/400x400/083060/FFFFFF/png?text=Water+ATMs", alt: "Water ATMs" }],
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

const ticketStore: Record<string, unknown>[] = [];
const waterTestStore: Record<string, unknown>[] = [];
const orderStore: Record<string, unknown>[] = [];

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

// ─── Products ─────────────────────────────────────────────────────────────────
router.get("/uc/products", async (req: Request, res: Response): Promise<void> => {
  try {
    if (hasWCCredentials()) {
      const extra: Record<string, string> = { per_page: "50" };
      if (req.query["category"]) extra["category"] = req.query["category"] as string;
      if (req.query["search"]) extra["search"] = req.query["search"] as string;
      const products = await wcFetchArray("/products", extra);
      if (products) {
        res.json(products.map(normalizeProduct));
        return;
      }
    }
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
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/uc/products/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(String(req.params["id"]));
  try {
    if (hasWCCredentials()) {
      const product = await wcFetchOne(`/products/${id}`);
      if (product) {
        res.json(normalizeProduct(product));
        return;
      }
    }
    const product = MOCK_PRODUCTS.find((p) => p["id"] === id);
    if (!product) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(product);
  } catch {
    res.status(500).json({ error: "Failed to fetch product" });
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
      // Re-issue our own signed JWT so it can be verified server-side.
      // The original WC token (signed with the WC secret) is discarded.
      const wcUser = {
        id: 1,
        email:     String(d["user_email"] ?? ""),
        firstName: displayName.split(" ")[0] ?? "Customer",
        lastName:  displayName.split(" ").slice(1).join(" "),
      };
      res.json({ token: issueToken(wcUser), user: wcUser });
      return;
    }
  } catch { /* fall through to mock */ }

  if (email && password.length >= 6) {
    const name = email.split("@")[0] ?? "customer";
    const mockUser = {
      id:        Date.now(),
      email,
      phone:     "",   // not collected at login; populated from the stored account
      firstName: name.charAt(0).toUpperCase() + name.slice(1),
      lastName:  "Customer",
    };
    res.json({ token: issueToken(mockUser), user: mockUser });
    return;
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
  // Basic phone sanity check — must start with + and contain 10-15 digits
  if (!/^\+\d{10,15}$/.test(phone.replace(/\s/g, ""))) {
    res.status(400).json({ error: "Enter a valid phone number in international format, e.g. +254712345678" });
    return;
  }
  const user = { id: Date.now(), email, phone: phone.replace(/\s/g, ""), firstName, lastName: lastName ?? "" };
  // Store referral association so first-order discount can be applied later
  if (referralCode?.trim()) {
    registerReferralAtSignup(email, referralCode.trim());
  }
  // Issue a signed JWT (HS256 with SESSION_SECRET)
  res.json({ token: issueToken(user), user });
});

// ─── Customer ─────────────────────────────────────────────────────────────────
router.get("/uc/customer/profile", (_req: Request, res: Response): void => {
  res.json({
    id: 1,
    email: "customer@example.com",
    firstName: "Jane",
    lastName: "Doe",
    billing: { firstName: "Jane", lastName: "Doe", address1: "123 Westlands Rd", address2: "", city: "Nairobi", country: "KE", phone: "+254700000000" },
    shipping: { firstName: "Jane", lastName: "Doe", address1: "123 Westlands Rd", address2: "", city: "Nairobi", country: "KE", phone: "+254700000000" },
  });
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
router.get("/uc/orders", async (_req: Request, res: Response): Promise<void> => {
  try {
    if (hasWCCredentials()) {
      const orders = await wcFetchArray("/orders", { per_page: "20", orderby: "date", order: "desc" });
      if (orders) {
        res.json(orders.map(normalizeOrder));
        return;
      }
    }
    res.json(orderStore);
  } catch {
    res.json(orderStore);
  }
});

// ─── Push notifications infrastructure ──────────────────────────────────────
// In-memory store: userId (from JWT) → Expo push token.
// Tokens survive as long as the process runs; a DB-backed store is tracked as
// a follow-up task.
const pushTokenStore = new Map<string, string>();

/**
 * Verify the Bearer JWT and return a stable user-identity string.
 * Returns "anonymous" when the token is absent, invalid, or unsigned.
 */
function userIdFromBearer(authHeader: string | undefined): string {
  const claims = verifyToken(authHeader);
  if (!claims) return "anonymous";
  return String(claims.id ?? claims.email ?? "anonymous");
}

/** Send a single push notification via the Expo Push API (throws on network failure). */
async function callExpoPushApi(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "Accept":          "application/json",
      "Accept-Encoding": "gzip, deflate",
    },
    body: JSON.stringify([{ to: token, title, body, data }]),
  });
}

/**
 * Look up the registered push token for a user and fire a notification.
 * Fire-and-forget: failures are swallowed so they never block the caller.
 */
function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): void {
  const token = pushTokenStore.get(userId);
  if (!token) return;
  callExpoPushApi(token, title, body, data).catch(() => { /* ignore */ });
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
          { screen: "orders", orderId: String(normalized["id"] ?? "") }
        );
        res.json(normalized);
        return;
      }
    }
  } catch { /* fall through to mock */ }

  const newOrder = {
    id: Date.now(),
    status: paymentMethod === "cod" ? "pending" : "processing",
    dateCreated: new Date().toISOString(),
    total: String(netTotal),
    currency: "KES",
    lineItems: productLines.map(({ productId, name, quantity, subtotal: t }) => ({
      productId, name, quantity, total: String(t),
    })),
    paymentMethod,
    shippingAddress: shippingAddress ?? {},
    discountPercent,
    discountAmount,
    promoCode: promoCode ?? "",
  };
  orderStore.push(newOrder);

  // Record referral conversion so the referrer earns credit
  if (discountType === "referral" && promoCode && userEmail) {
    recordReferralConversion(promoCode, userEmail);
  }

  // Server-side push notification: order confirmed (fire-and-forget)
  sendPushToUser(
    orderUserId,
    "✅ Order confirmed!",
    `Your order #${newOrder.id} is placed and being processed.`,
    { screen: "orders", orderId: String(newOrder.id) }
  );

  res.json(newOrder);
});

// ─── Push notification endpoints ─────────────────────────────────────────────

/**
 * POST /api/uc/notify/register
 * Authenticated — stores the caller's Expo push token in the server-side map.
 * The token is keyed by the user ID extracted from the Bearer JWT, so only
 * the authenticated user's own token is ever registered here.
 */
router.post("/uc/notify/register", (req: Request, res: Response): void => {
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
  pushTokenStore.set(userId, pushToken);
  res.json({ ok: true });
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

  const token = pushTokenStore.get(userId);
  if (!token) {
    res.status(404).json({ error: "No push token registered for this account" });
    return;
  }

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
    await callExpoPushApi(token, title, body ?? "", data ?? {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Push notification failed", detail: String(err) });
  }
});

// ─── Locations ────────────────────────────────────────────────────────────────
router.get("/uc/locations", (_req: Request, res: Response): void => {
  res.json(MOCK_LOCATIONS);
});

// ─── Tickets ──────────────────────────────────────────────────────────────────
router.get("/uc/tickets", (_req: Request, res: Response): void => {
  res.json(ticketStore);
});

router.post("/uc/tickets", (req: Request, res: Response): void => {
  const { productModel, issueDescription, preferredContactTime, photos } = req.body as {
    productModel?: string;
    issueDescription?: string;
    preferredContactTime?: string;
    photos?: string[];
  };
  if (!productModel || !issueDescription) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const ticket = {
    id: `TKT-${Date.now()}`,
    productModel,
    issueDescription,
    preferredContactTime: preferredContactTime ?? "Any time",
    photos: photos ?? [],
    status: "submitted",
    createdAt: new Date().toISOString(),
  };
  ticketStore.push(ticket);
  res.status(201).json(ticket);
});

// ─── Water Tests ──────────────────────────────────────────────────────────────
router.post("/uc/water-tests", (req: Request, res: Response): void => {
  const { name, address, phone, waterSource, concerns } = req.body as {
    name?: string;
    address?: string;
    phone?: string;
    waterSource?: string;
    concerns?: string;
  };
  if (!name || !address || !phone) {
    res.status(400).json({ error: "Required fields missing" });
    return;
  }
  const wt = {
    id: `WT-${Date.now()}`,
    name,
    address,
    phone,
    waterSource: waterSource ?? "Municipal",
    concerns: concerns ?? "",
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  waterTestStore.push(wt);
  res.status(201).json(wt);
});

export default router;
