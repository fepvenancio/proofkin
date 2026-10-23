// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice The two views of the collection that `Renderer.tokenURI` reads back from its caller.
/// @dev Both match what `mapping(uint256 => Token) public tokens` and a public `bestNodes`
///      array generate, so Proofkin.sol only has to declare them that way. The struct is §5.2's.
interface IProofkin {
    /// @dev Two storage slots: `seed` fills the first alone, and everything else (26 bytes) fits the
    ///      second. Declaring `program` first would waste a slot, because a 32-byte seed cannot share
    ///      one with it.
    struct Token {
        bytes32 seed; // render + replay seed
        address program; // SSTORE2 pointer
        uint8 puzzleId;
        uint8 nodeCount;
        uint8 depth;
        uint16 rank; // 1-based solve order within the puzzle
        bool recordAtMint;
    }

    function tokens(uint256 id) external view returns (Token memory);

    /// @notice Smallest node count solved so far for a puzzle; 255 until the first solve.
    function bestNodes(uint256 puzzleId) external view returns (uint8);
}
