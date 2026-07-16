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

// ── 2. Block ephemeral pnpm staging directories from the Metro watcher ───────
// pnpm creates short-lived _tmp_NNNN directories during postinstall scripts
// (e.g. react-native-maps, @expo/image-utils) and removes them before Metro
// starts walking the file tree.  Metro then throws ENOENT trying to watch
// them.  The blockList prevents Metro from ever trying to index those paths.
//
// We also exclude the Android Gradle tree for react-native-maps — it is never
// needed when running through Expo Go / web.
const blockPatterns = [
  // Any package's pnpm _tmp_NNNN staging dir (covers all packages)
  /_tmp_\d+[/\\]/,
  // react-native-maps android build tree
  /react-native-maps[^/\\]*[/\\]android[/\\]/,
];

const existing = config.resolver.blockList;
if (existing) {
  const prev = Array.isArray(existing) ? existing : [existing];
  config.resolver.blockList = [...prev, ...blockPatterns];
} else {
  config.resolver.blockList = blockPatterns;
}

module.exports = config;
