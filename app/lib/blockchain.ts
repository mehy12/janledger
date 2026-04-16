import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL ?? '';
const PRIVATE_KEY = process.env.PRIVATE_KEY ?? '';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS ?? '';

const CONTRACT_ABI = ['function storeHash(string memory _hash) public'];

/**
 * Store a hash string on-chain via the deployed storeHash contract.
 * Returns the transaction hash on success.
 * Throws if env vars are missing or the transaction fails.
 */
export async function storeHashOnChain(hash: string): Promise<string> {
  if (!RPC_URL || !PRIVATE_KEY || !CONTRACT_ADDRESS) {
    throw new Error(
      'Blockchain env vars missing. Set RPC_URL, PRIVATE_KEY, and CONTRACT_ADDRESS.',
    );
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

  const tx = await contract.storeHash(hash);
  const receipt = await tx.wait();

  return receipt.hash as string;
}
