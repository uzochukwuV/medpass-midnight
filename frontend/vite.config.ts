import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createReadStream, existsSync, mkdirSync, cpSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const managed = resolve(repoRoot, 'src/managed/medpass');
const shim = (name: string) => resolve(here, `node_modules/vite-plugin-node-polyfills/shims/${name}/dist/index.js`);

// The Compact artifacts (prover/verifier keys + zkir) are produced by
// `npm run build` in the repo root and gitignored. Serve them at /zk in dev and
// copy them into the build output, so FetchZkConfigProvider loads them from the
// app's own origin (no cross-origin artifact fetch).
function zkArtifacts(): Plugin {
  return {
    name: 'medpass-zk-artifacts',
    configureServer(server) {
      server.middlewares.use('/zk', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = resolve(managed, rel);
        if (!file.startsWith(managed) || !existsSync(file)) return next();
        res.setHeader('content-type', 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const out = resolve(here, 'dist/zk/medpass');
      if (!existsSync(managed)) return;
      mkdirSync(out, { recursive: true });
      cpSync(managed, out, { recursive: true });
    },
  };
}

// vite-plugin-node-polyfills rewrites `buffer`/`process`/`global` imports to
// its own bare `vite-plugin-node-polyfills/shims/*` specifiers during build,
// which the bundler then fails to resolve from dependencies. Intercept them
// first and hand back the absolute shim path.
function shimResolver(): Plugin {
  return {
    name: 'medpass-shim-resolver',
    enforce: 'pre',
    resolveId(source) {
      const m = /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(source);
      return m ? shim(m[1]) : null;
    },
  };
}

export default defineConfig({
  plugins: [
    shimResolver(),
    react(),
    wasm(),
    nodePolyfills({ include: ['buffer', 'process', 'crypto', 'stream', 'util', 'events'] }),
    zkArtifacts(),
  ],
  resolve: {
    alias: {
      '@medpass/contract': resolve(managed, 'contract/index.js'),
      '@medpass/simulator': resolve(repoRoot, 'tests/helpers/simulator.ts'),
    },
  },
  server: {
    port: 12001,
    host: true,
    allowedHosts: ['.prod-runtime.all-hands.dev'],
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 4000,
  },
});
