// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice What `Proofkin.tokenURI` asks of its renderer. The renderer reads the token back from its
///         caller (`msg.sender`), so it must be called through the collection.
interface IRenderer {
    function tokenURI(uint256 id) external view returns (string memory);
}
