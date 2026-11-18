// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Anchors one trusted AegisID issuer key hash for a verifier deployment.
/// @dev Only public issuer metadata belongs here. Never write holder data on-chain.
contract IssuerRegistry {
    // Kept in storage slot 0 for the verifier's read-only eth_getStorageAt lookup.
    bytes32 public issuerKeyHash;
    address public owner;

    event IssuerKeyHashChanged(bytes32 indexed previousHash, bytes32 indexed nextHash);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error OnlyOwner();
    error InvalidIssuerKeyHash();
    error InvalidOwner();

    constructor(bytes32 initialIssuerKeyHash) {
        if (initialIssuerKeyHash == bytes32(0)) revert InvalidIssuerKeyHash();
        issuerKeyHash = initialIssuerKeyHash;
        owner = msg.sender;
    }

    function setIssuerKeyHash(bytes32 nextIssuerKeyHash) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (nextIssuerKeyHash == bytes32(0)) revert InvalidIssuerKeyHash();
        bytes32 previousHash = issuerKeyHash;
        issuerKeyHash = nextIssuerKeyHash;
        emit IssuerKeyHashChanged(previousHash, nextIssuerKeyHash);
    }

    function transferOwnership(address nextOwner) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (nextOwner == address(0)) revert InvalidOwner();
        address previousOwner = owner;
        owner = nextOwner;
        emit OwnershipTransferred(previousOwner, nextOwner);
    }
}
