// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdCheats} from "forge-std/StdCheats.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {Proofkin} from "../../src/Proofkin.sol";
import {Variants} from "./Variants.sol";

/// @dev What the invariant fuzzer drives: it commits and reveals operand-swapped and padded variants of
///      the six fixture solutions, from several accounts, waiting too little, the right time or too
///      long. Every program it submits is a real solution, so the only reverts it should ever see are
///      the ones in `_expected`; anything else is recorded in `unexpectedRevert`.
contract ProofkinHandler is CommonBase, StdCheats, StdUtils {
    Proofkin public immutable proofkin;
    bytes[] internal bases;
    address[] internal actors;

    /// @notice Reveals that succeeded.
    uint256 public mints;
    /// @notice A revert the handler did not expect (the invariant `noUnexpectedReverts` watches it).
    bool public unexpectedRevert;
    bytes4 public lastUnexpected;

    uint256 public tooEarly;
    uint256 public expired;
    uint256 public alreadyMinted;
    uint256 public puzzleFull;

    constructor(Proofkin proofkin_, bytes[] memory bases_, address[] memory actors_) {
        proofkin = proofkin_;
        bases = bases_;
        actors = actors_;
    }

    function _expected(bytes4 selector) private returns (bool) {
        if (selector == Proofkin.TooEarly.selector) ++tooEarly;
        else if (selector == Proofkin.Expired.selector) ++expired;
        else if (selector == Proofkin.AlreadyMinted.selector) ++alreadyMinted;
        else if (selector == Proofkin.PuzzleFull.selector) ++puzzleFull;
        else return false;
        return true;
    }

    /// @dev One mint attempt. Three quarters of attempts go to puzzle 0 so that its 50 slots fill
    ///      within a run and the cap is actually reached.
    function attempt(uint256 pick, uint256 mask, uint256 padding, uint256 who, uint256 delay)
        external
    {
        uint256 puzzleId = pick % 4 == 0 ? (pick / 4) % 6 : 0;
        bytes memory base = bases[puzzleId];
        uint256 swaps = Variants.swappable(base);
        mask = mask % (1 << (swaps > 16 ? 16 : swaps));
        bytes memory program = Variants.pad(Variants.swap(base, mask), padding % 4);

        address actor = actors[who % actors.length];
        bytes32 salt = keccak256(abi.encode(program, actor));
        bytes32 h = keccak256(abi.encode(program, actor, salt));

        vm.prank(actor);
        try proofkin.commit(h) {}
        catch {
            return; // an earlier attempt of this (program, actor) is still outstanding
        }

        // 70% on time, 10% too early (same block + 1), 10% too early (block + 2), 10% too late
        uint256 d = delay % 10;
        vm.roll(block.number + (d < 7 ? 3 : d == 7 ? 1 : d == 8 ? 2 : 251));

        uint256 price = proofkin.mintPrice();
        deal(actor, actor.balance + price);
        vm.prank(actor);
        try proofkin.reveal{value: price}(program, salt) {
            ++mints;
        } catch (bytes memory reason) {
            bytes4 selector = bytes4(reason);
            if (!_expected(selector)) {
                unexpectedRevert = true;
                lastUnexpected = selector;
            }
        }
    }
}
