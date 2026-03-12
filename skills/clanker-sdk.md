---
name: use-clanker-sdk
description: Deploy ERC-20 tokens with Uniswap V4 liquidity using the Clanker SDK. Use when the user asks to deploy a token, create a coin, launch a token, configure liquidity pools, claim rewards, set up airdrops, presales, vaults, or interact with Clanker contracts.
---

# Using the Clanker SDK

## Installation
```bash
npm install clanker-sdk viem
```

## Quick Start
```typescript
import { Clanker } from 'clanker-sdk/v4';
import { createPublicClient, createWalletClient, http, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain: base, transport: http() }) as PublicClient;
const wallet = createWalletClient({ account, chain: base, transport: http() });
const clanker = new Clanker({ wallet, publicClient });

const { txHash, waitForTransaction, error } = await clanker.deploy({
  name: 'My Token', symbol: 'TKN', image: 'ipfs://...', tokenAdmin: account.address, chainId: base.id, vanity: true,
});
if (error) throw error;
const { address } = await waitForTransaction();
```

## Supported Chains
Base (8453), Base Sepolia (84532), Arbitrum (42161), Ethereum (1), BSC (56), Unichain (130), Monad, Abstract (11124)

## Key Config Options
- **vault**: `{ percentage: 10, lockupDuration: 2592000, vestingDuration: 2592000, recipient: addr }`
- **fees**: `FEE_CONFIGS.StaticBasic` (1% flat), `FEE_CONFIGS.DynamicBasic` (1-5%), `FEE_CONFIGS.Dynamic3` (1-3%)
- **sniperFees**: `{ startingFee: 666_777, endingFee: 41_673, secondsToDecay: 15 }`
- **devBuy**: `{ ethAmount: 0.01, recipient: addr }`
- **rewards**: `{ recipients: [{ admin, recipient, bps: 10000, token: 'Both' }] }`
- **airdrop**: Use `createAirdrop()` from `clanker-sdk/v4/extensions`
- **presale**: `{ bps: 2000 }` (20% of supply)
- **pool**: `{ pairedToken: 'WETH', positions: POOL_POSITIONS.Standard }`

## Post-Deploy
```typescript
await clanker.claimRewards({ token, rewardRecipient });
await clanker.claimVaultedTokens({ token });
await clanker.availableRewards({ token, rewardRecipient });
await clanker.updateImage({ token, newImage });
await clanker.updateMetadata({ token, metadata: { description } });
```

## Our $EXO Token
- Contract: 0xDafB07F4BfB683046e7277E24b225AD421819b07
- Claim fees: clanker.world/clanker/TOKEN_ADDRESS/admin
