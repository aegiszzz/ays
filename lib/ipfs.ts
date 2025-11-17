export const uploadToIPFS = async (base64Data: string): Promise<string> => {
  try {
    const mockCid = 'ipfs_' + Math.random().toString(36).substring(2, 15);
    return mockCid;
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    throw error;
  }
};

export const getIPFSGatewayUrl = (cid: string): string => {
  return cid;
};
