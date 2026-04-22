import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOWED_ORIGIN = process.env.EXPO_PUBLIC_APP_URL || '';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGIN && origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PINATA_JWT = process.env.PINATA_JWT;
  if (!PINATA_JWT) return res.status(500).json({ error: 'Server misconfigured' });

  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        'Content-Type': contentType,
      },
      body,
    });

    if (!pinataRes.ok) {
      const err = await pinataRes.text();
      console.error('Pinata upload failed:', err);
      return res.status(502).json({ error: 'Upload failed. Please try again.' });
    }

    const data = await pinataRes.json();
    return res.status(200).json({ cid: data.IpfsHash });
  } catch (err: any) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
}
