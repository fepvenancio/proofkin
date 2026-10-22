// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SSTORE2} from "solady/utils/SSTORE2.sol";
import {IProofkin} from "../../src/IProofkin.sol";
import {Renderer} from "../../src/Renderer.sol";

/// @dev Stands in for Proofkin.sol (milestone 3). It stores tokens the natural way, as a public
///      mapping of the §5.2 struct and a public `bestNodes` array, so the renderer's `IProofkin`
///      view of those getters is exercised against the real ABI shape.
contract MockProofkin {
    mapping(uint256 => IProofkin.Token) public tokens;
    uint8[6] public bestNodes = [255, 255, 255, 255, 255, 255];

    Renderer public immutable renderer;

    constructor(Renderer renderer_) {
        renderer = renderer_;
    }

    function mint(
        uint256 id,
        bytes memory program,
        bytes32 seed,
        uint8 depth,
        uint16 rank,
        bool recordAtMint
    ) external {
        tokens[id] = IProofkin.Token({
            program: SSTORE2.write(program),
            seed: seed,
            puzzleId: uint8(program[1]),
            nodeCount: uint8(program[2]),
            depth: depth,
            rank: rank,
            recordAtMint: recordAtMint
        });
    }

    function setBest(uint256 puzzleId, uint8 nodes) external {
        bestNodes[puzzleId] = nodes;
    }

    /// @dev What Proofkin.tokenURI will do: forward to the renderer, which reads back from `msg.sender`.
    function tokenURI(uint256 id) external view returns (string memory) {
        return renderer.tokenURI(id);
    }
}
