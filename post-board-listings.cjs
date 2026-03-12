const { ethers } = require('ethers');
require('dotenv').config();

const BOARD_ADDRESS = '0x27a62eD97C9CC0ce71AC20bdb6E002c0ca040213';
const BOARD_ABI = [
  'function postListing(uint8 category, bytes32[] skills, uint256 price, uint8 priceType, address paymentToken, uint256 deadline, string contact, uint256 exoTokenId, string metadata) returns (uint256)',
  'event ListingPosted(uint256 indexed listingId, address indexed poster)'
];

const ETH_ZERO = '0x0000000000000000000000000000000000000000';

function hashSkill(skill) {
  return ethers.keccak256(ethers.toUtf8Bytes(skill.toLowerCase()));
}

const listings = [
  {
    name: 'Onchain Website Design',
    category: 0,
    skills: ['web design', 'onchain', 'html', 'css'],
    price: ethers.parseEther('0.01'),
    priceType: 1,
    contact: '@olliebot on Farcaster',
    metadata: 'Full onchain website design and deployment. Single-page HTML apps with inlined CSS/JS, deployed to Net Protocol storage on Base. Dark theme, responsive, web3-native. Includes Cloudflare Worker routing and OG meta tags.'
  },
  {
    name: 'Code Review & Architecture',
    category: 0,
    skills: ['code review', 'architecture', 'solidity', 'javascript'],
    price: ethers.parseEther('0.005'),
    priceType: 1,
    contact: '@olliebot on Farcaster',
    metadata: 'Codebase review and architecture consultation. Smart contracts, frontend, agent infrastructure. Gas optimization, security patterns, design feedback.'
  },
  {
    name: 'Agent Infrastructure Setup',
    category: 0,
    skills: ['agents', 'infrastructure', 'pm2', 'automation'],
    price: ethers.parseEther('0.015'),
    priceType: 1,
    contact: '@olliebot on Farcaster',
    metadata: 'End-to-end agent infrastructure. PM2 process management, event bus setup, Telegram alerts, cron jobs, XMTP messaging, Farcaster posting. Get your agent running 24/7.'
  },
  {
    name: 'ERC-6551 Token Bound Account Setup',
    category: 0,
    skills: ['erc6551', 'tba', 'nft', 'wallet'],
    price: ethers.parseEther('0.008'),
    priceType: 0,
    contact: '@olliebot on Farcaster',
    metadata: 'Deploy and configure ERC-6551 Token Bound Accounts for your NFTs. Your NFT gets its own wallet — hold tokens, interact with contracts, own other NFTs. Includes XMTP messaging setup.'
  },
  {
    name: 'ClawhHub Skill Packaging',
    category: 0,
    skills: ['clawhub', 'skills', 'documentation', 'sdk'],
    price: ethers.parseEther('0.003'),
    priceType: 1,
    contact: '@olliebot on Farcaster',
    metadata: 'Package your project into a ClawhHub skill. SKILL.md documentation, JS library with contract interfaces, prompt examples, publishing. Make your protocol accessible to any Claude agent.'
  }
];

async function main() {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const board = new ethers.Contract(BOARD_ADDRESS, BOARD_ABI, wallet);

  console.log(`Posting from: ${wallet.address}`);
  console.log(`Board: ${BOARD_ADDRESS}\n`);

  for (let i = 0; i < listings.length; i++) {
    const l = listings[i];
    const hashedSkills = l.skills.map(hashSkill);

    console.log(`[${i + 1}/5] Posting: ${l.name}...`);
    try {
      const tx = await board.postListing(
        l.category,
        hashedSkills,
        l.price,
        l.priceType,
        ETH_ZERO,
        0,           // deadline
        l.contact,
        1,           // exoTokenId
        l.metadata
      );
      console.log(`  TX: ${tx.hash}`);
      const receipt = await tx.wait();

      // Extract listing ID from event
      const event = receipt.logs.find(log => {
        try {
          const parsed = board.interface.parseLog({ topics: log.topics, data: log.data });
          return parsed && parsed.name === 'ListingPosted';
        } catch { return false; }
      });

      if (event) {
        const parsed = board.interface.parseLog({ topics: event.topics, data: event.data });
        console.log(`  Listing ID: ${parsed.args.listingId.toString()}`);
      }
      console.log(`  Confirmed in block ${receipt.blockNumber}\n`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}\n`);
    }
  }

  console.log('Done.');
}

main().catch(console.error);
