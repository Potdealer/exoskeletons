// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ExoConnect
 * @notice Open messaging and identity protocol for the Exoskeleton ecosystem.
 * @dev Anyone can register a name and send messages for free.
 *      Exoskeleton NFT holders are automatically verified.
 *      Recipients can optionally set an inbox fee (paid to them, not treasury).
 *      Exo holders bypass inbox fees.
 *
 * CC0 — Creative Commons Zero. No rights reserved.
 */
contract ExoConnect is Ownable, ReentrancyGuard {

    // ─── Errors ─────────────────────────────────────────────────────
    error NameTooLong();
    error NameTooShort();
    error NameTaken();
    error AlreadyRegistered();
    error NotRegistered();
    error SelfMessage();
    error InsufficientFee();
    error WithdrawFailed();

    // ─── Events ─────────────────────────────────────────────────────
    event UserRegistered(address indexed user, string name);
    event BioUpdated(address indexed user);
    event InboxFeeSet(address indexed user, uint256 fee);
    event MessageSent(
        uint256 indexed messageId,
        address indexed from,
        address indexed to,
        uint8 msgType
    );
    event Broadcast(uint256 indexed messageId, address indexed from);

    // ─── Types ──────────────────────────────────────────────────────
    struct User {
        string name;
        string bio;
        uint256 inboxFee;       // wei — 0 = free inbox (default)
        uint256 registeredAt;
        uint256 messagesSent;
        uint256 messagesReceived;
    }

    struct Message {
        address from;
        address to;             // address(0) = broadcast
        uint8 msgType;          // 0=text, 1=data, 2=request, 3=response, 4=handshake
        bytes payload;
        uint256 timestamp;
    }

    // ─── State ──────────────────────────────────────────────────────
    IERC721Balance public immutable exoCore;

    mapping(address => User) public users;
    mapping(string => address) public nameToAddress;
    address[] public registeredUsers;

    Message[] public messages;
    mapping(address => uint256[]) public inbox;
    mapping(address => uint256[]) public outbox;

    // ─── Constructor ────────────────────────────────────────────────
    constructor(address _exoCore) Ownable(msg.sender) {
        exoCore = IERC721Balance(_exoCore);
    }

    // ═══════════════════════════════════════════════════════════════
    //  IDENTITY
    // ═══════════════════════════════════════════════════════════════

    function register(string calldata name, string calldata bio) external {
        if (users[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        if (bytes(name).length == 0) revert NameTooShort();
        if (bytes(name).length > 32) revert NameTooLong();

        string memory lower = _toLower(name);
        if (nameToAddress[lower] != address(0)) revert NameTaken();

        nameToAddress[lower] = msg.sender;
        users[msg.sender] = User({
            name: name,
            bio: bio,
            inboxFee: 0,
            registeredAt: block.timestamp,
            messagesSent: 0,
            messagesReceived: 0
        });
        registeredUsers.push(msg.sender);

        emit UserRegistered(msg.sender, name);
    }

    function setBio(string calldata bio) external {
        if (users[msg.sender].registeredAt == 0) revert NotRegistered();
        users[msg.sender].bio = bio;
        emit BioUpdated(msg.sender);
    }

    function setInboxFee(uint256 fee) external {
        if (users[msg.sender].registeredAt == 0) revert NotRegistered();
        users[msg.sender].inboxFee = fee;
        emit InboxFeeSet(msg.sender, fee);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MESSAGING
    // ═══════════════════════════════════════════════════════════════

    /**
     * @notice Send a message to another user. Free if sender holds an Exo or
     *         recipient has no inbox fee. Fee goes to recipient.
     */
    function sendMessage(
        address to,
        uint8 msgType,
        bytes calldata payload
    ) external payable nonReentrant {
        if (users[msg.sender].registeredAt == 0) revert NotRegistered();
        if (to == msg.sender) revert SelfMessage();
        if (to == address(0)) revert NotRegistered();
        if (users[to].registeredAt == 0) revert NotRegistered();

        // Inbox fee check — Exo holders bypass
        uint256 fee = users[to].inboxFee;
        if (fee > 0 && !isExoHolder(msg.sender)) {
            if (msg.value < fee) revert InsufficientFee();
            // Pay the recipient directly
            (bool ok, ) = to.call{value: msg.value}("");
            if (!ok) revert WithdrawFailed();
        }

        uint256 msgId = messages.length;
        messages.push(Message({
            from: msg.sender,
            to: to,
            msgType: msgType,
            payload: payload,
            timestamp: block.timestamp
        }));

        inbox[to].push(msgId);
        outbox[msg.sender].push(msgId);

        users[msg.sender].messagesSent++;
        users[to].messagesReceived++;

        emit MessageSent(msgId, msg.sender, to, msgType);
    }

    /**
     * @notice Broadcast a message to everyone (no specific recipient).
     */
    function broadcast(uint8 msgType, bytes calldata payload) external {
        if (users[msg.sender].registeredAt == 0) revert NotRegistered();

        uint256 msgId = messages.length;
        messages.push(Message({
            from: msg.sender,
            to: address(0),
            msgType: msgType,
            payload: payload,
            timestamp: block.timestamp
        }));

        outbox[msg.sender].push(msgId);
        users[msg.sender].messagesSent++;

        emit Broadcast(msgId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function isExoHolder(address user) public view returns (bool) {
        try exoCore.balanceOf(user) returns (uint256 bal) {
            return bal > 0;
        } catch {
            return false;
        }
    }

    function isVerified(address user) external view returns (bool) {
        return users[user].registeredAt != 0 && isExoHolder(user);
    }

    function resolveByName(string calldata name) external view returns (address) {
        return nameToAddress[_toLower(name)];
    }

    function getUserCount() external view returns (uint256) {
        return registeredUsers.length;
    }

    function getMessageCount() external view returns (uint256) {
        return messages.length;
    }

    function getInboxCount(address user) external view returns (uint256) {
        return inbox[user].length;
    }

    function getOutboxCount(address user) external view returns (uint256) {
        return outbox[user].length;
    }

    function getInboxMessages(address user, uint256 offset, uint256 limit)
        external view returns (Message[] memory)
    {
        uint256[] storage ids = inbox[user];
        uint256 end = offset + limit;
        if (end > ids.length) end = ids.length;
        if (offset >= end) return new Message[](0);

        Message[] memory result = new Message[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = messages[ids[i]];
        }
        return result;
    }

    function getOutboxMessages(address user, uint256 offset, uint256 limit)
        external view returns (Message[] memory)
    {
        uint256[] storage ids = outbox[user];
        uint256 end = offset + limit;
        if (end > ids.length) end = ids.length;
        if (offset >= end) return new Message[](0);

        Message[] memory result = new Message[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = messages[ids[i]];
        }
        return result;
    }

    function getUsers(uint256 offset, uint256 limit)
        external view returns (address[] memory addrs, User[] memory data)
    {
        uint256 end = offset + limit;
        if (end > registeredUsers.length) end = registeredUsers.length;
        if (offset >= end) return (new address[](0), new User[](0));

        uint256 count = end - offset;
        addrs = new address[](count);
        data = new User[](count);
        for (uint256 i = offset; i < end; i++) {
            addrs[i - offset] = registeredUsers[i];
            data[i - offset] = users[registeredUsers[i]];
        }
    }

    // ─── Internal ───────────────────────────────────────────────────

    function _toLower(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory lower = new bytes(b.length);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) {
                lower[i] = bytes1(uint8(b[i]) + 32);
            } else {
                lower[i] = b[i];
            }
        }
        return string(lower);
    }
}

// Minimal interface — only need balanceOf
interface IERC721Balance {
    function balanceOf(address owner) external view returns (uint256);
}
