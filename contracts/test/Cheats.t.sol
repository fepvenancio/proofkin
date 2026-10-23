// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {VM} from "../src/VM.sol";
import {Puzzles} from "../src/Puzzles.sol";
import {Proofkin} from "../src/Proofkin.sol";
import {ProofkinBase} from "./helpers/ProofkinBase.sol";

/// @notice fixtures/cheats.json holds wrong programs: each is a correct solution with one piece of the
///         work left out (a voter ignored, a path missed, a subset forgotten, a comparator dropped).
///         They are valid programs, so nothing but the trials can refuse them, and they have to be
///         refused whatever the seed. `pnpm gen:fixtures` builds the file from packages/vm/src/cheats.ts.
contract CheatsTest is ProofkinBase {
    uint256 constant CHEATS = 74;

    function setUp() public {
        _deploy(MINT_PRICE);
    }

    function _load() private view returns (string memory json, string[] memory names) {
        json = vm.readFile("fixtures/cheats.json");
        names = vm.parseJsonKeys(json, ".");
    }

    function _program(string memory json, string memory name) private pure returns (bytes memory) {
        return vm.parseJsonBytes(json, string.concat(".", name));
    }

    /// @dev Whether some fixed trial gets `program` wrong. Fixed trials ignore the seed, so none is needed.
    function _failsAFixedTrial(bytes memory program) private pure returns (bool) {
        uint256 id = uint8(program[1]);
        uint256 fixedCount = Puzzles.trialCount(id) - Puzzles.TRIALS + 2; // trials 0, 1, then 10 and up
        for (uint256 k; k < fixedCount; ++k) {
            uint256 trial = k < 2 ? k : k + Puzzles.TRIALS - 2;
            uint256[] memory x = Puzzles.inputs(id, bytes32(0), trial);
            (bool ok, uint256[] memory got,) = VM.run(program, x);
            if (
                !ok
                    || keccak256(abi.encode(got))
                        != keccak256(abi.encode(Puzzles.referenceOutputs(id, x)))
            ) {
                return true;
            }
        }
        return false;
    }

    function test_thereAreSeventyFourAndEachIsAValidProgram() public view {
        (string memory json, string[] memory names) = _load();
        assertEq(names.length, CHEATS);
        for (uint256 k; k < names.length; ++k) {
            bytes memory program = _program(json, names[k]);
            VM.validate(program); // reverts on anything the contract would call invalid
            assertLe(uint8(program[2]), 64, names[k]);
        }
    }

    function test_everyCheatFailsAFixedTrial() public view {
        (string memory json, string[] memory names) = _load();
        for (uint256 k; k < names.length; ++k) {
            assertTrue(_failsAFixedTrial(_program(json, names[k])), names[k]);
        }
    }

    /// @dev The real thing: commit, wait, reveal. Anything but `SolveFailed` would mean the contract
    ///      refused the program for another reason, or took it.
    function _revealFails(bytes memory program, bytes32 salt, string memory name) private {
        uint256 price = proofkin.mintPrice();
        deal(alice, price);
        vm.prank(alice);
        (bool ok, bytes memory ret) =
            address(proofkin).call{value: price}(abi.encodeCall(proofkin.reveal, (program, salt)));
        assertFalse(ok, name);
        assertEq(bytes4(ret), Proofkin.SolveFailed.selector, name);
    }

    function test_noCheatCanBeMinted() public {
        (string memory json, string[] memory names) = _load();
        for (uint256 k; k < names.length; ++k) {
            bytes memory program = _program(json, names[k]);
            (bytes32 salt,) = _commit(alice, program);
            vm.roll(block.number + REVEAL_DELAY + 1);
            _revealFails(program, salt, names[k]);
        }
        assertEq(proofkin.totalSupply(), 0);
    }

    /// Each run commits one cheat under a fresh salt, which makes a fresh seed.
    function testFuzz_noSeedLetsACheatThrough(uint256 pick, bytes32 salt) public {
        (string memory json, string[] memory names) = _load();
        string memory name = names[bound(pick, 0, names.length - 1)];
        bytes memory program = _program(json, name);

        vm.prank(alice);
        proofkin.commit(_commitHash(program, alice, salt));
        vm.roll(block.number + REVEAL_DELAY + 1);
        _revealFails(program, salt, name);
        assertEq(proofkin.totalSupply(), 0);
    }
}
