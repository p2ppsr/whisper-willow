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

