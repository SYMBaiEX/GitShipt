import { PublicKey } from "@solana/web3.js";
import { METEORA_DBC_PROGRAM_ID } from "@bagsfm/bags-sdk";
import { solanaConnection } from "@/lib/solana/connection";

/** Prove the expected wallet created this mint, rather than accepting a receipt string. */
export async function verifyLaunchTransaction(input: {
  signature: string;
  tokenMint: string;
  launchWallet: string;
  configKey: string;
}): Promise<void> {
  const connection = solanaConnection("confirmed");
  const tx = await connection.getTransaction(input.signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx?.meta || tx.meta.err) {
    throw new Error(
      "Launch transaction is not confirmed successfully. Wait for confirmation and retry completion.",
    );
  }
  const message = tx.transaction.message;
  const keys = message.getAccountKeys({
    accountKeysFromLookups: tx.meta.loadedAddresses,
  });
  const mint = new PublicKey(input.tokenMint);
  const wallet = new PublicKey(input.launchWallet);
  const config = new PublicKey(input.configKey);
  if (!keys.get(0)?.equals(wallet)) {
    throw new Error(
      "Launch transaction fee payer does not match the linked launch wallet.",
    );
  }
  let mintIndex = -1;
  let hasConfig = false;
  for (let i = 0; i < keys.length; i++) {
    if (keys.get(i)?.equals(mint)) mintIndex = i;
    if (keys.get(i)?.equals(config)) hasConfig = true;
  }
  const instructions = [
    ...message.compiledInstructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((group) => group.instructions),
  ];
  const launchesOnBags = instructions.some((ix) =>
    keys.get(ix.programIdIndex)?.equals(new PublicKey(METEORA_DBC_PROGRAM_ID)),
  );
  if (
    !hasConfig ||
    !launchesOnBags ||
    mintIndex < 0 ||
    tx.meta.preBalances[mintIndex] !== 0 ||
    !(tx.meta.postBalances[mintIndex]! > 0)
  ) {
    throw new Error(
      "Transaction does not create the prepared Bags token mint with its expected pool configuration.",
    );
  }
}
