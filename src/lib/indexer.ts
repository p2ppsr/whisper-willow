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
