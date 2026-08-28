export interface DepositEvent {
  txHash: string;
  blockNumber: number;
  userAddress: bigint;
  token: bigint;
  amount: bigint;
}

export interface RegisteredEvent {
  txHash: string;
  blockNumber: number;
  caller: bigint;
  commitment: bigint;
}

export interface FundedEvent {
  txHash: string;
  blockNumber: number;
  token: bigint;
  amount: bigint;
}

export interface JoinedRegistration {
  commitment: bigint;
  caller: bigint;
  token: bigint;
  amount: bigint;
  depositBlock: number;
  depositTxHash: string;
  registerBlock: number;
  registerTxHash: string;
}
