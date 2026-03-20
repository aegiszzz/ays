import type { VercelRequest, VercelResponse } from '@vercel/node';

const SOLANA_RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana.drpc.org',
  'https://solana-mainnet.rpc.extrnode.com',
];

const LAMPORTS_PER_SOL = 1_000_000_000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const address = req.query.address as string;

  if (!address) {
    return res.status(400).json({ error: 'address required' });
  }

  for (const rpcUrl of SOLANA_RPC_URLS) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [address, { commitment: 'confirmed' }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data.error) continue;

      const lamports = data.result?.value ?? 0;
      return res.status(200).json({ balance: (lamports / LAMPORTS_PER_SOL).toFixed(4) });
    } catch {}
  }

  return res.status(500).json({ error: 'All RPC endpoints failed', balance: '0.0000' });
}
