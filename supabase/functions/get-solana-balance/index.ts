const SOLANA_RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana.drpc.org',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://go.getblock.io/solana-mainnet',
];

const LAMPORTS_PER_SOL = 1_000_000_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('SITE_URL') || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

async function getBalanceFromRpc(rpcUrl: string, address: string): Promise<number> {
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

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'RPC error');
  }

  return data.result?.value ?? 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let address = url.searchParams.get('address');

    if (!address && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      address = body.address || null;
    }

    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Address parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let lastError: Error | null = null;

    for (let i = 0; i < SOLANA_RPC_URLS.length; i++) {
      const rpcUrl = SOLANA_RPC_URLS[i];
      try {
        const lamports = await getBalanceFromRpc(rpcUrl, address);
        const balanceInSol = lamports / LAMPORTS_PER_SOL;

        console.log('✓ Balance fetched via', rpcUrl);

        return new Response(
          JSON.stringify({
            balance: balanceInSol.toFixed(4),
            balanceRaw: lamports,
            address,
            rpcUsed: rpcUrl,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: any) {
        console.error(`✗ Failed with RPC ${rpcUrl}:`, error.message);
        lastError = error;
      }
    }

    throw lastError ?? new Error('All RPC endpoints failed');

  } catch (error: any) {
    console.error('Error getting balance:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to get balance', balance: '0.0000' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
