import { Connection, PublicKey, LAMPORTS_PER_SOL } from 'npm:@solana/web3.js@1.95.8';

const SOLANA_RPC_URLS = [
  'https://api.mainnet-beta.solana.com',
  'https://mainnet.helius-rpc.com/?api-key=public',
  'https://solana.public-rpc.com',
  'https://rpc.ankr.com/solana',
  'https://solana-api.projectserum.com'
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const address = url.searchParams.get('address');

    if (!address) {
      return new Response(
        JSON.stringify({ error: 'Address parameter is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Checking balance for address:', address);

    for (let i = 0; i < SOLANA_RPC_URLS.length; i++) {
      const rpcUrl = SOLANA_RPC_URLS[i];
      try {
        console.log(`Trying RPC ${i + 1}/${SOLANA_RPC_URLS.length}: ${rpcUrl}`);
        
        const connection = new Connection(rpcUrl, 'confirmed');
        const publicKey = new PublicKey(address);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        const balance = await connection.getBalance(publicKey);
        clearTimeout(timeoutId);
        
        const balanceInSol = balance / LAMPORTS_PER_SOL;
        
        console.log('✓ Success! Balance:', balanceInSol, 'SOL');
        
        return new Response(
          JSON.stringify({
            balance: balanceInSol.toFixed(4),
            balanceRaw: balance,
            address: address,
            rpcUsed: rpcUrl
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (error: any) {
        console.error(`✗ Failed with RPC ${rpcUrl}:`, error.message);
        if (i === SOLANA_RPC_URLS.length - 1) {
          throw error;
        }
      }
    }

    throw new Error('All RPC endpoints failed');
    
  } catch (error: any) {
    console.error('Error getting balance:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to get balance',
        balance: '0.0000'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});