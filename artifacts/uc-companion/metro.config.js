const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── 1. Exclude react-native-maps from the web bundle ────────────────────────
// The .native.tsx / .tsx platform split keeps the import out of the web entry
// point, but Metro still resolves the full module graph eagerly.
const { resolver } = config;
const upstream = resolver.resolveRequest;
resolver.resolveRequest = (ctx, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'empty' };
  }
  if (upstream) return upstream(ctx, moduleName, platform);
  return ctx.resolveRequest(ctx, moduleName, platform);
};

// ── 2. Block react-native-maps native / temp directories from the watcher ───
// pnpm creates short-lived _tmp_NNNN staging directories during install that
// are deleted before Metro starts watching — causing ENOENT crashes.
// We also don't need Metro to index the Android gradle build tree on Linux.
const { mergeConfig } = require('metro-config');

const blockPatterns = [
  // Temp staging dirs created & deleted by pnpm postinstall
  /react-native-maps[^/]*_tmp_\d+[/\\].*/,
  // Android Gradle tree — not needed when running in Expo Go / web
  /react-native-maps[^/]*[/\\]android[/\\].*/,
];

const existing = config.resolver.blockList;
if (existing) {
  // blockList can be a RegExp, an array, or a module result
  const prev = Array.isArray(existing) ? existing : [existing];
  config.resolver.blockList = [...prev, ...blockPatterns];
} else {
  config.resolver.blockList = blockPatterns;
}

module.exports = config;
