import { WalletClient } from '@bsv/sdk';

let _wallet: WalletClient | null = null;

export async function getWallet(): Promise<WalletClient> {
  if (_wallet) return _wallet;
  _wallet = new WalletClient('auto'); // detects an available BRC-100 wallet substrate
  await _wallet.connectToSubstrate();
  return _wallet;
}
