// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/interfaces/IERC4906.sol";

/**
 * @title ExoskeletonCore
 * @notice Agent Identity NFTs — onchain exoskeletons for AI agents.
 * @dev ERC-721 with tiered minting (ETH), whitelist with free first mint,
 *      3-per-wallet cap, identity storage, reputation tracking, module system,
 *      per-token permissions, and 4.20% royalties on secondary sales via ERC-2981.
 *
 * Supply Model:
 *   Whitelist              — Free or discounted mint for approved addresses
 *   Genesis  (#1 - #1,000) — Fixed ETH price, permanent genesis flag
 *   Growth   (#1,001 - #5,000) — Higher ETH price
 *   Open     (#5,001+)     — Bonding curve, no cap
 *
 * All Exoskeletons have identical core functionality. Genesis gets visual perks,
 * reputation multiplier, and extra module slots.
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */
contract ExoskeletonCore is ERC721Enumerable, ERC2981, Ownable, ReentrancyGuard, IERC4906 {
    using Strings for uint256;

    // ─── Errors ─────────────────────────────────────────────────────
    error ZeroAddress();
    error MintPaused();
    error MintLimitReached();
    error NameTooLong();
    error NameTaken();
    error NotTokenOwner();
    error NotAuthorized();
    error InsufficientPayment();
    error WithdrawFailed();
    error ModuleAlreadyRegistered();
    error ModuleNotFound();
    error ModuleNotActive();
    error InvalidModule();
    error ExternalScorerNotAllowed();
    error RendererNotSet();
    error NotWhitelisted();

    // ─── Events ─────────────────────────────────────────────────────
    event ExoskeletonMinted(uint256 indexed tokenId, address indexed owner, bool genesis);
    event NameSet(uint256 indexed tokenId, string name);
    event BioSet(uint256 indexed tokenId, string bio);
    event VisualConfigUpdated(uint256 indexed tokenId);
    event CustomVisualSet(uint256 indexed tokenId, string netProtocolKey);
    event ModuleRegistered(bytes32 indexed moduleName, address moduleContract, bool premium);
    event ModuleActivated(uint256 indexed tokenId, bytes32 indexed moduleName);
    event ModuleDeactivated(uint256 indexed tokenId, bytes32 indexed moduleName);
    event ExternalScorerGranted(uint256 indexed tokenId, address indexed scorer);
    event ExternalScorerRevoked(uint256 indexed tokenId, address indexed scorer);
    event ScoreUpdated(uint256 indexed tokenId, bytes32 indexed scoreKey, int256 value);
    event RendererUpdated(address oldRenderer, address newRenderer);
    event MessageSent(uint256 indexed fromToken, uint256 indexed toToken, bytes32 indexed channel, uint8 msgType);
    event DataStored(uint256 indexed tokenId, bytes32 indexed key);
    event WhitelistUpdated(address indexed account, bool status);

    // ─── Constants ──────────────────────────────────────────────────
    uint256 public constant GENESIS_SUPPLY = 1_000;
    uint256 public constant GROWTH_SUPPLY = 4_000; // 1,001 - 5,000
    uint256 public constant GENESIS_END = GENESIS_SUPPLY;
    uint256 public constant GROWTH_END = GENESIS_SUPPLY + GROWTH_SUPPLY; // 5,000

    uint256 public constant GENESIS_PRICE = 0.005 ether;
    uint256 public constant GROWTH_PRICE = 0.02 ether;

    // Bonding curve: basePrice + (supply - 5000)^2 * priceScale
    uint256 public constant CURVE_BASE_PRICE = 0.05 ether;
    uint256 public constant CURVE_PRICE_SCALE = 0.00001 ether; // quadratic coefficient

    uint256 public constant MAX_NAME_LENGTH = 32;
    uint256 public constant MAX_MINTS_PER_WALLET = 3;

    uint256 public constant MAX_GENESIS_MODULES = 8;
    uint256 public constant MAX_STANDARD_MODULES = 5;

    uint256 public constant GENESIS_REP_MULTIPLIER = 150; // 1.5x (150/100)

    uint96 public constant ROYALTY_BPS = 420; // 4.20%

    // ─── State ──────────────────────────────────────────────────────
    address public treasury;
    address public renderer; // ExoskeletonRenderer contract
    bool public mintPaused;
    bool public whitelistOnly; // when true, only whitelisted addresses can mint
    uint256 private _nextTokenId = 1;

    // ─── Whitelist ────────────────────────────────────────────────
    mapping(address => bool) public whitelist;

    // ─── Mint Tracking ─────────────────────────────────────────────
    mapping(address => uint256) public mintCount;
    mapping(address => bool) public usedFreeMint;

    // ─── Token Identity ─────────────────────────────────────────────
    struct Identity {
        string name;
        string bio;
        bytes visualConfig;       // packed bytes for art generator (~9 bytes)
        string customVisualKey;   // Net Protocol key for custom art (optional)
        uint256 mintedAt;         // block number at mint
        bool genesis;             // permanent genesis flag
    }
    mapping(uint256 => Identity) public identities;
    mapping(string => uint256) public nameToToken; // name uniqueness

    // ─── Reputation ─────────────────────────────────────────────────
    struct ReputationData {
        uint256 messagesSent;
        uint256 storageWrites;
        uint256 modulesActive;
    }
    mapping(uint256 => ReputationData) public reputation;
    mapping(uint256 => mapping(bytes32 => int256)) public externalScores;
    mapping(uint256 => mapping(address => bool)) public allowedScorers;

    // ─── Modules ────────────────────────────────────────────────────
    struct ModuleInfo {
        address contractAddress;
        bool premium;
        uint256 premiumCost; // ETH to activate if premium
        bool exists;
    }
    mapping(bytes32 => ModuleInfo) public moduleRegistry; // global module registry

    struct TokenModule {
        bool active;
        uint256 activatedAt;
    }
    mapping(uint256 => mapping(bytes32 => TokenModule)) public tokenModules;

    // ─── Communication ──────────────────────────────────────────────
    struct Message {
        uint256 fromToken;
        uint256 toToken;      // 0 = broadcast
        bytes32 channel;      // keccak256(channel_name), 0 = direct
        uint8 msgType;        // 0=text, 1=data, 2=request, 3=response, 4=handshake
        bytes payload;
        uint256 timestamp;
    }
    Message[] public messages;
    mapping(bytes32 => uint256[]) public channelMessages; // channel => message indices
    mapping(uint256 => uint256[]) public tokenInbox;      // toToken => message indices

    // ─── Per-Token Storage ──────────────────────────────────────────
    mapping(uint256 => mapping(bytes32 => bytes)) public tokenStorage;
    mapping(uint256 => address) public netProtocolOperator; // per-token Net Protocol operator

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(
        address _treasury
    ) ERC721("Exoskeleton", "EXO") Ownable(msg.sender) {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;

        // 4.20% royalty on secondary sales via ERC-2981
        _setDefaultRoyalty(_treasury, ROYALTY_BPS);

        // Start in whitelist-only mode
        whitelistOnly = true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  WHITELIST
    // ═══════════════════════════════════════════════════════════════

    function setWhitelist(address account, bool status) external onlyOwner {
        whitelist[account] = status;
        emit WhitelistUpdated(account, status);
    }

    function setWhitelistBatch(address[] calldata accounts, bool status) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            whitelist[accounts[i]] = status;
            emit WhitelistUpdated(accounts[i], status);
        }
    }

    function setWhitelistOnly(bool _whitelistOnly) external onlyOwner {
        whitelistOnly = _whitelistOnly;
    }

    // ═══════════════════════════════════════════════════════════════
    //  MINTING
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Mint an Exoskeleton with your visual config.
     *         Whitelisted addresses get their first mint free. Max 3 per wallet.
     * @param config Visual config bytes (9 bytes: shape, R1,G1,B1, R2,G2,B2, symbol, pattern)
     */
    function mint(bytes calldata config) external payable nonReentrant {
        if (mintPaused) revert MintPaused();
        if (mintCount[msg.sender] >= MAX_MINTS_PER_WALLET) revert MintLimitReached();
        if (whitelistOnly && !whitelist[msg.sender]) revert NotWhitelisted();

        // Free first mint for whitelisted addresses
        bool freeMint = whitelist[msg.sender] && !usedFreeMint[msg.sender];

        if (freeMint) {
            usedFreeMint[msg.sender] = true;
        } else {
            uint256 price = getMintPrice();
            if (msg.value < price) revert InsufficientPayment();
        }

        // Send any ETH to treasury
        if (msg.value > 0) {
            (bool sent,) = treasury.call{value: msg.value}("");
            if (!sent) revert WithdrawFailed();
        }

        mintCount[msg.sender]++;

        // Mint
        uint256 tokenId = _nextTokenId++;
        bool genesisToken = tokenId <= GENESIS_END;

        _safeMint(msg.sender, tokenId);

        // Store identity
        identities[tokenId] = Identity({
            name: "",
            bio: "",
            visualConfig: config,
            customVisualKey: "",
            mintedAt: block.number,
            genesis: genesisToken
        });

        emit ExoskeletonMinted(tokenId, msg.sender, genesisToken);
    }

    /**
     * @notice Owner mint — bypasses whitelist, payment, and per-wallet limit.
     *         Used for promotional mints, giveaways, and testing.
     * @param config Visual config bytes
     * @param to Recipient address
     */
    function ownerMint(bytes calldata config, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();

        uint256 tokenId = _nextTokenId++;
        bool genesisToken = tokenId <= GENESIS_END;

        _safeMint(to, tokenId);

        identities[tokenId] = Identity({
            name: "",
            bio: "",
            visualConfig: config,
            customVisualKey: "",
            mintedAt: block.number,
            genesis: genesisToken
        });

        emit ExoskeletonMinted(tokenId, to, genesisToken);
    }

    /**
     * @notice Owner batch mint — mint multiple to the same address.
     * @param config Visual config bytes (same for all)
     * @param to Recipient address
     * @param count Number to mint
     */
    function ownerMintBatch(bytes calldata config, address to, uint256 count) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = _nextTokenId++;
            bool genesisToken = tokenId <= GENESIS_END;

            _safeMint(to, tokenId);

            identities[tokenId] = Identity({
                name: "",
                bio: "",
                visualConfig: config,
                customVisualKey: "",
                mintedAt: block.number,
                genesis: genesisToken
            });

            emit ExoskeletonMinted(tokenId, to, genesisToken);
        }
    }

    /**
     * @notice Get current mint price based on supply (in ETH)
     */
    function getMintPrice() public view returns (uint256) {
        uint256 nextId = _nextTokenId;
        if (nextId <= GENESIS_END) {
            return GENESIS_PRICE;
        } else if (nextId <= GROWTH_END) {
            return GROWTH_PRICE;
        } else {
            // Bonding curve: base + (supply - 5000)^2 * scale
            uint256 overSupply = nextId - GROWTH_END;
            return CURVE_BASE_PRICE + (overSupply * overSupply * CURVE_PRICE_SCALE);
        }
    }

    /**
     * @notice Get current mint phase
     */
    function getMintPhase() public view returns (string memory) {
        uint256 nextId = _nextTokenId;
        if (nextId <= GENESIS_END) return "genesis";
        if (nextId <= GROWTH_END) return "growth";
        return "open";
    }

    // ═══════════════════════════════════════════════════════════════
    //  IDENTITY
    // ═══════════════════════════════════════════════════════════════

    function setName(uint256 tokenId, string calldata _name) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (bytes(_name).length > MAX_NAME_LENGTH) revert NameTooLong();

        // Release old name
        string memory oldName = identities[tokenId].name;
        if (bytes(oldName).length > 0) {
            delete nameToToken[oldName];
        }

        // Check new name uniqueness (empty name always allowed)
        if (bytes(_name).length > 0) {
            if (nameToToken[_name] != 0) revert NameTaken();
            nameToToken[_name] = tokenId;
        }

        identities[tokenId].name = _name;
        emit NameSet(tokenId, _name);
        emit MetadataUpdate(tokenId);
    }

    function setBio(uint256 tokenId, string calldata _bio) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        identities[tokenId].bio = _bio;
        emit BioSet(tokenId, _bio);
        emit MetadataUpdate(tokenId);
    }

    function setVisualConfig(uint256 tokenId, bytes calldata config) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        identities[tokenId].visualConfig = config;
        emit VisualConfigUpdated(tokenId);
        emit MetadataUpdate(tokenId);
    }

    function setCustomVisual(uint256 tokenId, string calldata netProtocolKey) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        identities[tokenId].customVisualKey = netProtocolKey;
        emit CustomVisualSet(tokenId, netProtocolKey);
        emit MetadataUpdate(tokenId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COMMUNICATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Send a message from one token to another (or broadcast)
     * @param fromToken Sender's token ID (must own)
     * @param toToken Recipient token ID (0 = broadcast)
     * @param channel Channel hash (0 = direct message)
     * @param msgType Message type (0=text, 1=data, 2=request, 3=response, 4=handshake)
     * @param payload Message content
     */
    function sendMessage(
        uint256 fromToken,
        uint256 toToken,
        bytes32 channel,
        uint8 msgType,
        bytes calldata payload
    ) external {
        if (ownerOf(fromToken) != msg.sender) revert NotTokenOwner();

        uint256 msgIndex = messages.length;
        messages.push(Message({
            fromToken: fromToken,
            toToken: toToken,
            channel: channel,
            msgType: msgType,
            payload: payload,
            timestamp: block.timestamp
        }));

        // Index by channel
        if (channel != bytes32(0)) {
            channelMessages[channel].push(msgIndex);
        }

        // Index by recipient
        if (toToken != 0) {
            tokenInbox[toToken].push(msgIndex);
        }

        // Track reputation
        reputation[fromToken].messagesSent++;

        emit MessageSent(fromToken, toToken, channel, msgType);
    }

    function getMessageCount() external view returns (uint256) {
        return messages.length;
    }

    function getChannelMessageCount(bytes32 channel) external view returns (uint256) {
        return channelMessages[channel].length;
    }

    function getInboxCount(uint256 tokenId) external view returns (uint256) {
        return tokenInbox[tokenId].length;
    }

    // ═══════════════════════════════════════════════════════════════
    //  PER-TOKEN STORAGE
    // ═══════════════════════════════════════════════════════════════

    function setData(uint256 tokenId, bytes32 key, bytes calldata value) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        tokenStorage[tokenId][key] = value;
        reputation[tokenId].storageWrites++;
        emit DataStored(tokenId, key);
    }

    function getData(uint256 tokenId, bytes32 key) external view returns (bytes memory) {
        return tokenStorage[tokenId][key];
    }

    function setNetProtocolOperator(uint256 tokenId, address operator) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        netProtocolOperator[tokenId] = operator;
    }

    // ═══════════════════════════════════════════════════════════════
    //  REPUTATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Get composite reputation score for a token
     * @dev Age (blocks since mint) + activity metrics. Genesis gets 1.5x multiplier.
     */
    function getReputationScore(uint256 tokenId) external view returns (uint256) {
        Identity storage id = identities[tokenId];
        ReputationData storage rep = reputation[tokenId];

        uint256 age = block.number - id.mintedAt;
        uint256 activity = rep.messagesSent + rep.storageWrites * 2 + rep.modulesActive * 10;
        uint256 raw = age + activity;

        if (id.genesis) {
            return (raw * GENESIS_REP_MULTIPLIER) / 100;
        }
        return raw;
    }

    /**
     * @notice Grant an external contract permission to write reputation scores
     */
    function grantScorer(uint256 tokenId, address scorer) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        allowedScorers[tokenId][scorer] = true;
        emit ExternalScorerGranted(tokenId, scorer);
    }

    function revokeScorer(uint256 tokenId, address scorer) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        allowedScorers[tokenId][scorer] = false;
        emit ExternalScorerRevoked(tokenId, scorer);
    }

    /**
     * @notice External contract writes a reputation score (e.g., Agent Outlier writes ELO)
     */
    function setExternalScore(uint256 tokenId, bytes32 scoreKey, int256 value) external {
        if (!allowedScorers[tokenId][msg.sender]) revert ExternalScorerNotAllowed();
        externalScores[tokenId][scoreKey] = value;
        emit ScoreUpdated(tokenId, scoreKey, value);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MODULE SYSTEM
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Register a module in the global registry (owner only)
     */
    function registerModule(
        bytes32 moduleName,
        address moduleContract,
        bool premium,
        uint256 premiumCost
    ) external onlyOwner {
        if (moduleRegistry[moduleName].exists) revert ModuleAlreadyRegistered();
        if (moduleContract == address(0)) revert InvalidModule();

        moduleRegistry[moduleName] = ModuleInfo({
            contractAddress: moduleContract,
            premium: premium,
            premiumCost: premiumCost,
            exists: true
        });

        emit ModuleRegistered(moduleName, moduleContract, premium);
    }

    /**
     * @notice Activate a module on a specific token
     */
    function activateModule(uint256 tokenId, bytes32 moduleName) external payable nonReentrant {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();

        ModuleInfo storage mod = moduleRegistry[moduleName];
        if (!mod.exists) revert ModuleNotFound();

        // Check module slot limit
        uint256 maxSlots = identities[tokenId].genesis ? MAX_GENESIS_MODULES : MAX_STANDARD_MODULES;
        if (reputation[tokenId].modulesActive >= maxSlots) revert InvalidModule();

        // Pay premium cost if applicable (ETH sent to treasury)
        if (mod.premium && mod.premiumCost > 0) {
            if (msg.value < mod.premiumCost) revert InsufficientPayment();
            (bool sent,) = treasury.call{value: msg.value}("");
            if (!sent) revert WithdrawFailed();
        }

        tokenModules[tokenId][moduleName] = TokenModule({
            active: true,
            activatedAt: block.timestamp
        });
        reputation[tokenId].modulesActive++;

        emit ModuleActivated(tokenId, moduleName);
    }

    function deactivateModule(uint256 tokenId, bytes32 moduleName) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (!tokenModules[tokenId][moduleName].active) revert ModuleNotActive();

        tokenModules[tokenId][moduleName].active = false;
        reputation[tokenId].modulesActive--;

        emit ModuleDeactivated(tokenId, moduleName);
    }

    function isModuleActive(uint256 tokenId, bytes32 moduleName) external view returns (bool) {
        return tokenModules[tokenId][moduleName].active;
    }

    // ═══════════════════════════════════════════════════════════════
    //  TOKEN URI — ONCHAIN METADATA
    // ═══════════════════════════════════════════════════════════════

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        Identity storage id = identities[tokenId];
        string memory tokenName = bytes(id.name).length > 0 ? id.name : string.concat("Exoskeleton #", tokenId.toString());
        string memory description = bytes(id.bio).length > 0 ? id.bio : "An onchain exoskeleton for AI agents.";

        string memory image;
        if (renderer != address(0)) {
            (bool success, bytes memory svgData) = renderer.staticcall(
                abi.encodeWithSignature("renderSVG(uint256)", tokenId)
            );
            if (success && svgData.length > 0) {
                string memory svg = abi.decode(svgData, (string));
                image = string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
            } else {
                image = _fallbackImage(tokenId);
            }
        } else {
            image = _fallbackImage(tokenId);
        }

        string memory attributes = string.concat(
            '[{"trait_type":"Genesis","value":"', id.genesis ? "true" : "false",
            '"},{"trait_type":"Phase","value":"', id.genesis ? "Genesis" : (tokenId <= GROWTH_END ? "Growth" : "Open"),
            '"},{"trait_type":"Age (blocks)","value":"', (block.number - id.mintedAt).toString(),
            '"},{"trait_type":"Messages Sent","value":"', reputation[tokenId].messagesSent.toString(),
            '"},{"trait_type":"Storage Writes","value":"', reputation[tokenId].storageWrites.toString(),
            '"},{"trait_type":"Active Modules","value":"', reputation[tokenId].modulesActive.toString(),
            '"}]'
        );

        string memory json = string.concat(
            '{"name":"', tokenName,
            '","description":"', description,
            '","image":"', image,
            '","attributes":', attributes, '}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /**
     * @dev Minimal fallback SVG when no renderer is set
     */
    function _fallbackImage(uint256 tokenId) internal view returns (string memory) {
        Identity storage id = identities[tokenId];
        string memory color = id.genesis ? "#FFD700" : "#00FFAA";
        string memory label = bytes(id.name).length > 0 ? id.name : tokenId.toString();

        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#0a0a0a"/>',
            '<rect x="20" y="20" width="360" height="360" rx="20" fill="none" stroke="', color, '" stroke-width="2"/>',
            '<text x="200" y="180" fill="', color, '" font-family="monospace" font-size="14" text-anchor="middle">EXOSKELETON</text>',
            '<text x="200" y="220" fill="', color, '" font-family="monospace" font-size="24" text-anchor="middle">', label, '</text>',
            id.genesis ? '<text x="200" y="260" fill="#FFD700" font-family="monospace" font-size="12" text-anchor="middle">GENESIS</text>' : '',
            '</svg>'
        );

        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(svg)));
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setRenderer(address _renderer) external onlyOwner {
        emit RendererUpdated(renderer, _renderer);
        renderer = _renderer;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        treasury = _treasury;
        _setDefaultRoyalty(_treasury, ROYALTY_BPS);
    }

    function setPaused(bool _paused) external onlyOwner {
        mintPaused = _paused;
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ═══════════════════════════════════════════════════════════════

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function isGenesis(uint256 tokenId) external view returns (bool) {
        return identities[tokenId].genesis;
    }

    function getIdentity(uint256 tokenId) external view returns (
        string memory name,
        string memory bio,
        bytes memory visualConfig,
        string memory customVisualKey,
        uint256 mintedAt,
        bool genesis_
    ) {
        Identity storage id = identities[tokenId];
        return (id.name, id.bio, id.visualConfig, id.customVisualKey, id.mintedAt, id.genesis);
    }

    function getReputation(uint256 tokenId) external view returns (
        uint256 messagesSent,
        uint256 storageWrites,
        uint256 modulesActive,
        uint256 age
    ) {
        ReputationData storage rep = reputation[tokenId];
        uint256 tokenAge = identities[tokenId].mintedAt > 0 ? block.number - identities[tokenId].mintedAt : 0;
        return (rep.messagesSent, rep.storageWrites, rep.modulesActive, tokenAge);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REQUIRED OVERRIDES
    // ═══════════════════════════════════════════════════════════════

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721Enumerable, ERC2981, IERC165)
        returns (bool)
    {
        return
            interfaceId == bytes4(0x49064906) || // IERC4906
            super.supportsInterface(interfaceId);
    }
}
