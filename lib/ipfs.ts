const PINATA_JWT = process.env.EXPO_PUBLIC_PINATA_JWT;
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export const uploadToIPFS = async (base64Data: string): Promise<string> => {
  try {
    if (!PINATA_JWT) {
      throw new Error('Pinata JWT not configured');
    }

    const base64Content = base64Data.split(',')[1] || base64Data;
    const blob = await fetch(`data:image/jpeg;base64,${base64Content}`).then(r => r.blob());

    const formData = new FormData();
    formData.append('file', blob as any, 'image.jpg');

    const metadata = JSON.stringify({
      name: `AYS-${Date.now()}.jpg`,
    });
    formData.append('pinataMetadata', metadata);

    const options = JSON.stringify({
      cidVersion: 1,
    });
    formData.append('pinataOptions', options);

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: formData as any,
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Pinata upload failed: ${errorData}`);
    }

    const data = await response.json();
    return data.IpfsHash;
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
