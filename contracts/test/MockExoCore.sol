// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

contract MockExoCore is ERC721Enumerable {
    uint256 private _nextId = 1;

    // Scorer permissions: tokenId => scorer => allowed
    mapping(uint256 => mapping(address => bool)) public allowedScorers;
    // Scores: tokenId => key => value
    mapping(uint256 => mapping(bytes32 => int256)) public externalScores;

    error ExternalScorerNotAllowed();

    event ExternalScorerGranted(uint256 indexed tokenId, address indexed scorer);
    event ScoreUpdated(uint256 indexed tokenId, bytes32 indexed scoreKey, int256 value);

    constructor() ERC721("MockExo", "MEXO") {}

    function mint(address to) external returns (uint256) {
        uint256 id = _nextId++;
        _mint(to, id);
        return id;
    }

    function grantScorer(uint256 tokenId, address scorer) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        allowedScorers[tokenId][scorer] = true;
        emit ExternalScorerGranted(tokenId, scorer);
    }

    function setExternalScore(uint256 tokenId, bytes32 scoreKey, int256 value) external {
        if (!allowedScorers[tokenId][msg.sender]) revert ExternalScorerNotAllowed();
        externalScores[tokenId][scoreKey] = value;
        emit ScoreUpdated(tokenId, scoreKey, value);
    }
}
