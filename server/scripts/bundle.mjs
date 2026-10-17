// Bundles the Lambda into dist/handler.mjs (one ESM file, Node 22). Terraform zips dist/ and deploys it.
// Cross-platform (Windows, macOS, Linux): npm run bundle
import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.ts'],
  outfile: 'dist/handler.mjs',
  bundle: true,
  platform: 'node',
  target: 'es2023',
  format: 'esm',
  minify: true,
  sourcemap: false,
  // Some AWS SDK code still calls require(); give ESM a require.
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
