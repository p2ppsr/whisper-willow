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
