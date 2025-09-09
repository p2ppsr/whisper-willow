#!/usr/bin/env bash
set -euo pipefail

# Dead-simple bootstrap for a TreeChat-style BitcoinSchema studio (React + Vite + TS)
# Creates files in the CURRENT directory. Fails fast if package.json already exists.

PROJECT_NAME="${PROJECT_NAME:-btc-schema-studio}"

if [[ -e package.json ]]; then
  echo "Refusing to proceed: package.json already exists in $(pwd)"
  echo "Run this script in an empty directory."
  exit 1
fi

mkdir -p src/lib

############################
# package.json
############################
cat > package.json <<'JSON'
{
  "name": "btc-schema-studio",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@bsv/sdk": "^1.7.5",
    "axios": "^1.7.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.4",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.4",
    "vite": "^5.4.0"
  }
}
JSON

############################
# tsconfig.json
############################
cat > tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
JSON

############################
# vite.config.ts
############################
cat > vite.config.ts <<'TS'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()]
});
TS

############################
# index.html
############################
cat > index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0" />
    <title>BitcoinSchema Studio</title>
    <style>
      html, body, #root { height: 100%; margin: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f8f9fb; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
HTML

############################
# src/main.tsx
############################
cat > src/main.tsx <<'TSX'
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
TSX

############################
# src/App.tsx
############################
cat > src/App.tsx <<'TSX'
import React, { useEffect, useState } from 'react';
import { getWallet } from './lib/wallet';
import { publishPost, DEFAULT_APP } from './lib/bitcoinSchema';
import { searchPosts, fetchPostBmap, type BmapPost } from './lib/indexer';

function Composer({ onPosted }: { onPosted: (txid: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const wallet = await getWallet();
      const res = await publishPost(wallet, text.trim(), { app: DEFAULT_APP });
      if ((res as any)?.txid) onPosted((res as any).txid);
      setText('');
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Say something to the chain…"
        rows={3}
        style={{ flex: 1, padding: 8 }}
      />
      <button disabled={busy} style={{ padding: '8px 12px' }}>
        {busy ? 'Posting…' : 'Post'}
      </button>
      {err && <div style={{ color: 'crimson' }}>{err}</div>}
    </form>
  );
}

function PostCard({ p }: { p: BmapPost }) {
  return (
    <div style={{
      border: '1px solid #e3e3e3',
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
      background: 'white'
    }}>
      <div style={{ fontSize: 12, color: '#777' }}>
        {p.author ? `@${p.author}` : 'unknown'} · {p.txid.slice(0, 10)}…
      </div>
      <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.content}</div>
    </div>
  );
}

export default function App() {
  const [posts, setPosts] = useState<BmapPost[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const txids = await searchPosts(DEFAULT_APP, 30);
    const detailed = await Promise.all(txids.map(fetchPostBmap));
    setPosts(detailed.filter(Boolean) as BmapPost[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: 20,
      background: '#f8f9fb',
      minHeight: '100vh'
    }}>
      <h2 style={{ marginBottom: 8 }}>BitcoinSchema Studio</h2>
      <div style={{ color: '#666', marginBottom: 12 }}>
        Public posts tagged as <b>app={DEFAULT_APP}</b>. New posts are signed with your BRC-100 wallet (AIP).
      </div>
      <Composer onPosted={() => load()} />
      {loading ? <div>Loading…</div> : posts.map(p => <PostCard key={p.txid} p={p} />)}
    </div>
  );
}
TSX

############################
# src/lib/wallet.ts
############################
cat > src/lib/wallet.ts <<'TS'
import WalletClient from '@bsv/sdk/dist/wallet/WalletClient';

let _wallet: WalletClient | null = null;

export async function getWallet(): Promise<WalletClient> {
  if (_wallet) return _wallet;
  _wallet = new WalletClient('auto'); // detects an available BRC-100 wallet substrate
  await _wallet.connectToSubstrate();
  return _wallet;
}
TS

############################
# src/lib/bitcoinSchema.ts
############################
cat > src/lib/bitcoinSchema.ts <<'TS'
import { LockingScript, PublicKey } from '@bsv/sdk';
import type WalletClient from '@bsv/sdk/dist/wallet/WalletClient';

export const ADDR_B   = '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut';
export const ADDR_MAP = '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5';
export const ADDR_AIP = '15PciHG22SNLQJXMoSUaWVi7WSqc7hCfva';

export const DEFAULT_APP = 'treechat.ai';

const te = new TextEncoder();

function bytes(s: string | Uint8Array): number[] {
  return typeof s === 'string' ? Array.from(te.encode(s)) : Array.from(s);
}

export async function buildPostOpReturnHex(
  wallet: WalletClient,
  content: string,
  {
    mediaType = 'text/markdown',
    encoding = 'utf-8',
    app = DEFAULT_APP,
    context,
    subcontext
  }: {
    mediaType?: string;
    encoding?: string;
    app?: string;
    context?: { key: string; value: string };
    subcontext?: { key: string; value: string };
  } = {}
): Promise<string> {
  const s = new LockingScript();
  s.writeOpCode(0x00); // OP_FALSE
  s.writeOpCode(0x6a); // OP_RETURN

  // B: content payload + headers
  s.writeBin(bytes(ADDR_B));
  s.writeBin(bytes(content));
  s.writeBin(bytes(mediaType));
  s.writeBin(bytes(encoding));

  // MAP: app + type=post (+ optional context/subcontext)
  s.writeBin(bytes(ADDR_MAP));
  s.writeBin(bytes('SET'));
  s.writeBin(bytes('app'));
  s.writeBin(bytes(app));
  s.writeBin(bytes('type'));
  s.writeBin(bytes('post'));

  if (context) {
    s.writeBin(bytes('context'));
    s.writeBin(bytes(context.key));
    s.writeBin(bytes(context.value));
  }
  if (subcontext) {
    s.writeBin(bytes('subcontext'));
    s.writeBin(bytes(subcontext.key));
    s.writeBin(bytes(subcontext.value));
  }

  // AIP identity/signature
  const protocolID: [number, string] = [1, 'schema'];
  const keyID = '1';

  const { publicKey } = await (wallet as any).getPublicKey({
    protocolID,
    keyID
  });

  const aipAddress = PublicKey.fromString(publicKey).toAddress().toString();

  const preimage = new Uint8Array(s.toBinary());
  const sigResult: any = await (wallet as any).createSignature({
    data: preimage,
    protocolID,
    keyID
  });
  const signature: number[] = Array.isArray(sigResult)
    ? sigResult
    : Array.isArray(sigResult?.signature)
      ? sigResult.signature
      : Array.from(sigResult as Uint8Array);

  s.writeBin(bytes(ADDR_AIP));
  s.writeBin(bytes('BITCOIN_ECDSA'));
  s.writeBin(bytes(aipAddress));
  s.writeBin(signature);

  return s.toHex();
}

export async function publishPost(
  wallet: WalletClient,
  content: string,
  opts?: Parameters<typeof buildPostOpReturnHex>[2]
) {
  const opReturnHex = await buildPostOpReturnHex(wallet, content, opts);
  const res = await (wallet as any).createAction({
    description: 'Post to BitcoinSchema',
    outputs: [{ satoshis: 0, script: opReturnHex }]
  });
  return res;
}
TS

############################
# src/lib/indexer.ts
############################
cat > src/lib/indexer.ts <<'TS'
import axios from 'axios';

export type BmapPost = {
  txid: string;
  timestamp?: number;
  app?: string;
  content?: string;
  mediaType?: string;
  encoding?: string;
  author?: string;
};

const BITAILS = 'https://api.bitails.io';
const BMAP    = 'https://b.map.sv/tx';

export async function searchPosts(app = 'treechat.ai', limit = 25): Promise<string[]> {
  const q = encodeURIComponent(`MAP SET app ${app} type post`);
  const url = `${BITAILS}/search?q=${q}&type=ops&limit=${limit}`;
  const { data } = await axios.get(url);
  const results = data?.ops?.results ?? [];
  return results.map((r: any) => r.txid);
}

export async function fetchPostBmap(txid: string): Promise<BmapPost | null> {
  try {
    const { data } = await axios.get(`${BMAP}/${txid}/bmap`);
    const out = (data?.out || [])[0] || null;
    const map = (out as any)?.map || {};
    // B payload location varies between servers
    const b = (out as any)?.b?.b || (out as any)?.map?.b || {};
    const aip = (out as any)?.aip || {};

    const content   = b?.content || b?.[0] || '';
    const mediaType = b?.type || b?.[1] || '';
    const encoding  = b?.encoding || b?.[2] || '';
    const app       = map?.app || map?.APP || map?.['app'];
    const author    = aip?.address || aip?.['address'];

    return { txid, content, mediaType, encoding, app, author, timestamp: data?.blk?.t };
  } catch {
    return null;
  }
}
TS

############################
# README.md
############################
cat > README.md <<'MD'
# BitcoinSchema Studio (TreeChat-style)

A tiny React + TypeScript studio that **reads and writes BitcoinSchema posts** using a **BRC-100 wallet** via the TS SDK.  
Write path uses `WalletClient.createAction` and AIP identity with `getPublicKey({ protocolID: [1,'schema'], keyID: '1' })` plus `createSignature`.  
Read path queries a BitcoinSchema-aware indexer to pull posts tagged `app=treechat.ai` (`type=post`).

## Quick start
1. Ensure you have Node 18+.
2. Install deps: `npm i`
3. Start dev server: `npm run dev`
4. Make sure a BRC-100 wallet substrate is running/available (the app will attempt `WalletClient('auto')`).
5. Post something and watch it show up in the feed.

## What it does
- Publishes OP_FALSE OP_RETURN outputs with B (content), MAP (`app=treechat.ai`, `type=post`), and AIP (identity/signature).
- Uses `WalletClient` to sign and broadcast.
- Uses a public indexer to discover and parse posts (BMAP) for display.

## License
Open BSV License. See: https://bitcoinassociation.net/open-bsv-license/

MD

############################
# .gitignore
############################
cat > .gitignore <<'IGN'
node_modules
dist
.vite
.DS_Store
*.log
IGN

echo "Done. Files written."
echo
echo "Next:"
echo "  npm i"
echo "  npm run dev"
echo
echo "Make sure your BRC-100 wallet is running so WalletClient('auto') can connect."

