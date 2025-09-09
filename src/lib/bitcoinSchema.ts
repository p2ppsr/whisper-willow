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
  const res = await wallet.createAction({
    description: 'Post to BitcoinSchema',
    outputs: [{
      satoshis: 1,
      LockingScript: opReturnHex,
      outputDescription: 'Output'
    }]
  });
  return res;
}
