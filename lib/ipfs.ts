const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export const uploadToIPFS = async (uri: string): Promise<string> => {
  try {
    let blob: Blob;

    if (uri.startsWith('data:') || uri.startsWith('blob:') || uri.startsWith('http')) {
      const response = await fetch(uri);
      blob = await response.blob();
    } else {
      throw new Error('Unsupported URI format: ' + uri.substring(0, 50));
    }

    const timestamp = Date.now();
    const formData = new FormData();
    formData.append('file', blob as any, `image-${timestamp}.jpg`);
    formData.append('pinataMetadata', JSON.stringify({ name: `AYS-${timestamp}.jpg` }));
    formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

    const response = await fetch('/api/upload-ipfs', {
      method: 'POST',
      body: formData as any,
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Upload failed: ${errorData}`);
    }

    const data = await response.json();
    return data.cid;
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    throw error;
  }
};

export const getIPFSGatewayUrl = (cid: string): string => {
  if (cid.startsWith('http')) {
    return cid;
  }

  if (PINATA_GATEWAY && PINATA_GATEWAY !== 'your_gateway_url_here') {
    return `${PINATA_GATEWAY}/ipfs/${cid}`;
  }

  return `https://ipfs.io/ipfs/${cid}`;
};
