import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { MemoryBlockstore } from 'blockstore-core';
import { MemoryDatastore } from 'datastore-core';

let heliaInstance: any = null;
let fsInstance: any = null;

export const getIPFS = async () => {
  if (!heliaInstance) {
    const blockstore = new MemoryBlockstore();
    const datastore = new MemoryDatastore();

    heliaInstance = await createHelia({
      blockstore,
      datastore,
    });

    fsInstance = unixfs(heliaInstance);
  }

  return { helia: heliaInstance, fs: fsInstance };
};

export const uploadToIPFS = async (fileData: Uint8Array): Promise<string> => {
  try {
    const { fs } = await getIPFS();
    const cid = await fs.addBytes(fileData);
    return cid.toString();
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    throw error;
  }
};

export const downloadFromIPFS = async (cid: string): Promise<Uint8Array> => {
  try {
    const { fs } = await getIPFS();
    const chunks: Uint8Array[] = [];

    for await (const chunk of fs.cat(cid)) {
      chunks.push(chunk);
    }

    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    return result;
  } catch (error) {
    console.error('Error downloading from IPFS:', error);
    throw error;
  }
};

export const getIPFSGatewayUrl = (cid: string): string => {
  return `https://ipfs.io/ipfs/${cid}`;
};
