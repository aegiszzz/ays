import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const PINATA_GATEWAY = Deno.env.get('PINATA_GATEWAY') || 'https://gateway.pinata.cloud/ipfs';
const PINATA_JWT = Deno.env.get('PINATA_JWT');

const ErrorCodes = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  UPLOAD_ERROR: 'UPLOAD_ERROR',
};

interface ThumbnailRequest {
  media_share_id: string;
  ipfs_cid: string;
  media_type: 'image' | 'video';
}

async function uploadToPinata(buffer: ArrayBuffer, filename: string): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([buffer]);
  formData.append('file', blob, filename);

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Pinata upload failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.IpfsHash;
}

async function generateImageThumbnail(buffer: ArrayBuffer, size: number): Promise<ArrayBuffer> {
  try {
    const sharp = (await import('npm:sharp@0.33.0')).default;

    const resized = await sharp(buffer)
      .resize(size, size, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 75 })
      .toBuffer();

    return resized.buffer;
  } catch (error) {
    console.error('Sharp processing failed:', error);
    throw new Error('Image processing failed');
  }
}

async function generateVideoThumbnail(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  console.log('Video thumbnail generation not yet implemented, using placeholder');
  return buffer;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Missing authorization',
          code: ErrorCodes.UNAUTHORIZED
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { media_share_id, ipfs_cid, media_type }: ThumbnailRequest = await req.json();

    if (!media_share_id || !ipfs_cid || !media_type) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          code: ErrorCodes.INVALID_REQUEST
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'process-thumbnail',
      media_share_id,
      ipfs_cid,
      media_type,
      action: 'start_processing',
    }));

    await supabase
      .from('media_shares')
      .update({ processing_status: 'processing' })
      .eq('id', media_share_id);

    const downloadUrl = `${PINATA_GATEWAY}/${ipfs_cid}`;
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`Failed to download from IPFS: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();

    let thumbnailBuffer: ArrayBuffer;
    let previewBuffer: ArrayBuffer | null = null;
    let posterBuffer: ArrayBuffer | null = null;

    if (media_type === 'image') {
      thumbnailBuffer = await generateImageThumbnail(buffer, 300);
      previewBuffer = await generateImageThumbnail(buffer, 600);
    } else if (media_type === 'video') {
      posterBuffer = await generateVideoThumbnail(buffer);
      thumbnailBuffer = posterBuffer;
    } else {
      throw new Error('Unsupported media type');
    }

    const thumbnailCid = await uploadToPinata(thumbnailBuffer, `thumbnail_${ipfs_cid}.jpg`);
    const previewCid = previewBuffer ? await uploadToPinata(previewBuffer, `preview_${ipfs_cid}.jpg`) : null;
    const posterCid = posterBuffer && media_type === 'video' ? await uploadToPinata(posterBuffer, `poster_${ipfs_cid}.jpg`) : null;

    await supabase
      .from('media_shares')
      .update({
        thumbnail_cid: thumbnailCid,
        preview_cid: previewCid,
        video_poster_cid: posterCid,
        processing_status: 'complete',
      })
      .eq('id', media_share_id);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'process-thumbnail',
      media_share_id,
      thumbnail_cid: thumbnailCid,
      preview_cid: previewCid,
      poster_cid: posterCid,
      action: 'complete',
    }));

    return new Response(
      JSON.stringify({
        success: true,
        thumbnail_cid: thumbnailCid,
        preview_cid: previewCid,
        video_poster_cid: posterCid,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'process-thumbnail',
      error: error.message,
      stack: error.stack,
    }));

    return new Response(
      JSON.stringify({
        error: 'Thumbnail processing failed',
        code: ErrorCodes.PROCESSING_ERROR
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
