// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IProofkin} from "../../src/IProofkin.sol";
import {Proofkin} from "../../src/Proofkin.sol";
import {Renderer} from "../../src/Renderer.sol";

/// @dev Deployment and commit/reveal plumbing shared by the Proofkin tests.
///
/// Foundry gotcha handled here: `vm.prank` and `vm.expectRevert` apply to the NEXT call, so every
/// value they would otherwise spend on a helper call (`mintPrice()`, ...) is read first.
abstract contract ProofkinBase is Test {
    /// @dev The launch price. Every test runs at it unless it says otherwise; PLAN.md §11 left it open
    ///      and the owner chose 0.01 ETH.
    uint256 internal constant MINT_PRICE = 0.01 ether;
    uint256 internal constant SLOTS = 50;
    uint256 internal constant REVEAL_DELAY = 2;
    uint256 internal constant REVEAL_WINDOW = 250;

    Renderer internal renderer;
    Proofkin internal proofkin;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function _deploy(uint256 price) internal {
        renderer = new Renderer();
        proofkin = new Proofkin(owner, address(renderer), price);
    }

    function _solution(string memory name) internal view returns (bytes memory) {
        return vm.parseJsonBytes(vm.readFile("fixtures/solutions.json"), string.concat(".", name));
    }

    function _token(uint256 id) internal view returns (IProofkin.Token memory t) {
        (t.seed, t.program, t.puzzleId, t.nodeCount, t.depth, t.rank, t.recordAtMint) =
            proofkin.tokens(id);
    }

    function _salt(bytes memory program, address who) internal pure returns (bytes32) {
        return keccak256(abi.encode("salt", program, who));
    }

    function _commitHash(bytes memory program, address who, bytes32 salt)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(program, who, salt));
    }

    /// @dev Commits `program` as `who`, with the helper's standard salt.
    function _commit(address who, bytes memory program) internal returns (bytes32 salt, bytes32 h) {
        salt = _salt(program, who);
        h = _commitHash(program, who, salt);
        vm.prank(who);
        proofkin.commit(h);
    }

    function _reveal(address who, bytes memory program, bytes32 salt) internal {
        uint256 price = proofkin.mintPrice();
        deal(who, who.balance + price);
        vm.prank(who);
        proofkin.reveal{value: price}(program, salt);
    }

    /// @dev Reveal that must revert with exactly `err`.
    function _revealReverts(address who, bytes memory program, bytes32 salt, bytes memory err)
        internal
    {
        uint256 price = proofkin.mintPrice();
        deal(who, who.balance + price);
        vm.expectRevert(err);
        vm.prank(who);
        proofkin.reveal{value: price}(program, salt);
    }

    /// @dev The whole flow: commit, wait out the delay, reveal. Returns the new token's id.
    function _mintAs(address who, bytes memory program) internal returns (uint256) {
        (bytes32 salt,) = _commit(who, program);
        vm.roll(block.number + REVEAL_DELAY + 1);
        _reveal(who, program, salt);
        return proofkin.totalSupply();
    }
}
