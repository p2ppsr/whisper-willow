// src/lib/indexer.ts
import axios from 'axios';

export type BmapPost = {
  txid: string;
  timestamp?: number;
  app?: string;
  content?: string;
  mediaType?: string;
  encoding?: string;
  author?: string; // AIP address (P2PKH-style) if present
};

const BITAILS = 'https://api.bitails.io';
const WOC = 'https://api.whatsonchain.com/v1/bsv/main';

const ADDR_B   = '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut';
const ADDR_MAP = '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5';
const ADDR_AIP = '15PciHG22SNLQJXMoSUaWVi7WSqc7hCfva';

const td = new TextDecoder();

/** Basic hex -> Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

/** Parse OP_FALSE OP_RETURN pushes into an array of byte arrays */
function parseOpReturnPushes(scriptHex: string): Uint8Array[] {
  const b = hexToBytes(scriptHex);
  let i = 0;

  // tolerate scripts with/without OP_FALSE prefix before OP_RETURN
  if (b[i] === 0x00) i++;
  if (b[i] !== 0x6a) return [];
  i++;

  const pushes: Uint8Array[] = [];
  while (i < b.length) {
    const op = b[i++];

    // empty push
    if (op === 0x00) {
      pushes.push(new Uint8Array());
      continue;
    }

    let len: number | null = null;
    if (op >= 0x01 && op <= 0x4b) {
      len = op;
    } else if (op === 0x4c) {
      len = b[i++];
    } else if (op === 0x4d) {
      len = b[i] | (b[i + 1] << 8); i += 2;
    } else if (op === 0x4e) {
      len = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24); i += 4;
    } else {
      // Non-push opcode in an OP_RETURN script — bail
      break;
    }
    const end = i + (len ?? 0);
    pushes.push(b.slice(i, end));
    i = end;
  }
  return pushes;
}

function toStr(u8: Uint8Array): string {
  try {
    return td.decode(u8);
  } catch {
    return '';
  }
}

/** Interpret B/MAP/AIP from OP_RETURN pushes */
function interpretBitcoinSchema(pushes: Uint8Array[]): Partial<BmapPost> | null {
  if (!pushes.length) return null;
  const s = pushes.map(toStr);

  let content = '';
  let mediaType = '';
  let encoding = '';
  let app: string | undefined;
  let author: string | undefined;

  for (let i = 0; i < s.length; i++) {
    const v = s[i];

    if (v === ADDR_B) {
      content = toStr(pushes[i + 1] || new Uint8Array());
      mediaType = s[i + 2] || '';
      encoding = s[i + 3] || '';
      i += 3;
      continue;
    }

    if (v === ADDR_MAP) {
      // MAP "SET key value key value ..."
      let j = i + 1;
      if (s[j] === 'SET') j++;
      while (j < s.length) {
        const nv = s[j];
        if (nv === ADDR_AIP || nv === ADDR_B || nv === ADDR_MAP) break;
        const key = s[j++];
        const val = s[j++];
        if (key === 'app') app = val;
        // we don't strictly need 'type', context, etc. here
      }
      i = j - 1;
      continue;
    }

    if (v === ADDR_AIP) {
      // AIP: [ADDR_AIP, 'BITCOIN_ECDSA', address, signature]
      author = s[i + 2];
      i += 3;
      continue;
    }
  }

  return { content, mediaType, encoding, app, author };
}

/** Search for TreeChat-style posts: MAP SET app <app> type post */
export async function searchPosts(app = 'treechat.ai', limit = 25): Promise<string[]> {
  const q = encodeURIComponent(`MAP SET app ${app} type post`);
  const url = `${BITAILS}/search?q=${q}&type=ops&limit=${limit}`;
  const { data } = await axios.get(url);
  const results = data?.ops?.results ?? [];
  return results.map((r: any) => r.txid);
}

/** Fetch and parse one tx's OP_RETURN, no external BMAP service required */
export async function fetchPostBmap(txid: string): Promise<BmapPost | null> {
  // 1) Preferred: Whatsonchain has vout.scriptPubKey.{hex,asm}
  try {
    const { data } = await axios.get(`${WOC}/tx/hash/${txid}`);
    const vout = (data?.vout || []) as any[];
    const opret = vout.find(
      (o) =>
        o?.scriptPubKey?.asm?.startsWith('OP_FALSE OP_RETURN') ||
        o?.scriptPubKey?.asm?.startsWith('OP_RETURN') ||
        (typeof o?.scriptPubKey?.hex === 'string' &&
          (o.scriptPubKey.hex.startsWith('006a') || o.scriptPubKey.hex.startsWith('6a')))
    );
    if (opret?.scriptPubKey?.hex) {
      const hex = opret.scriptPubKey.hex as string;
      const pushes = parseOpReturnPushes(hex.startsWith('6a') ? '00' + hex : hex);
      const parsed = interpretBitcoinSchema(pushes);
      if (parsed) return { txid, ...parsed, timestamp: data?.time };
    }
  } catch {
    // fall through to Bitails
  }

  // 2) Fallback: try first few outputs from Bitails download endpoint and parse
  try {
    for (let i = 0; i < 6; i++) {
      const { data } = await axios.get(`${BITAILS}/download/tx/${txid}/output/${i}/hex`);
      const hex: string | undefined = typeof data === 'string' ? data : undefined;
      if (!hex) continue;
      if (!hex.includes('6a')) continue; // quick skip if no OP_RETURN marker
      const pushes = parseOpReturnPushes(hex.startsWith('6a') ? '00' + hex : hex);
      const parsed = interpretBitcoinSchema(pushes);
      if (parsed) return { txid, ...parsed };
    }
  } catch {
    // ignore
  }

  return null;
}
