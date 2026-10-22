// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {VM} from "../src/VM.sol";
import {Puzzles} from "../src/Puzzles.sol";
import {VMHarness} from "./helpers/VMHarness.sol";

/// @notice Replays fixtures/diff.json, written by the TypeScript reference (`pnpm gen:fixtures`),
///         and requires the Solidity VM and Puzzles to agree with it on every row.
/// @dev Foundry maps a JSON object onto a struct by alphabetical key order, so the struct fields
///      below are declared in that order. Programs are JSON byte arrays because Foundry guesses
///      types from hex strings and misreads some byte lengths.
///
///      Each test decodes its own slice of rows: one transaction's memory only grows, so a single
///      test over all rows runs out of gas. The chunk counts below must cover the whole fixture
///      (4000 valid rows, 500 invalid, 1728 vectors); `test_chunksCoverTheWholeFixture` checks it.
contract DifferentialTest is Test {
    struct ValidRow {
        uint256[] inputs;
        bool ok;
        uint256[] outputs;
        uint256[] program;
        uint256 puzzleId;
        uint256[] values;
    }

    struct InvalidRow {
        uint256 index;
        uint256[] program;
        string rule;
    }

    struct VectorRow {
        uint256[] expected;
        uint256[] inputs;
        uint256 puzzleId;
        bytes32 seed;
        uint256 trial;
    }

    uint256 constant VALID_CHUNK = 500; // x 8
    uint256 constant INVALID_CHUNK = 250; // x 2
    uint256 constant VECTOR_CHUNK = 432; // x 4

    VMHarness h = new VMHarness();

    function _slice(string memory key, uint256 chunk, uint256 n)
        private
        view
        returns (bytes memory)
    {
        string memory path = string.concat(
            key, "[", vm.toString(n * chunk), ":", vm.toString((n + 1) * chunk), "]"
        );
        return vm.parseJson(vm.readFile("fixtures/diff.json"), path);
    }

    function _bytes(uint256[] memory xs) private pure returns (bytes memory b) {
        b = new bytes(xs.length);
        for (uint256 i; i < xs.length; ++i) {
            b[i] = bytes1(uint8(xs[i]));
        }
    }

    function _msg(string memory what, uint256 row) private pure returns (string memory) {
        return string.concat(what, ", row ", vm.toString(row));
    }

    // ------------------------------------------------------------ valid programs

    function _checkValid(uint256 n) private view {
        ValidRow[] memory rows = abi.decode(_slice(".valid", VALID_CHUNK, n), (ValidRow[]));
        assertEq(rows.length, VALID_CHUNK, "fixture looks truncated");

        for (uint256 i; i < rows.length; ++i) {
            ValidRow memory r = rows[i];
            bytes memory program = _bytes(r.program);
            VM.validate(program);

            (bool ok, uint256[] memory outputs, uint256[] memory values) = VM.run(program, r.inputs);
            uint256 row = n * VALID_CHUNK + i;
            assertEq(ok, r.ok, _msg("ok", row));
            assertEq(abi.encode(outputs), abi.encode(r.outputs), _msg("outputs", row));
            assertEq(abi.encode(values), abi.encode(r.values), _msg("values", row));
        }
    }

    function test_validPrograms_0() public view {
        _checkValid(0);
    }

    function test_validPrograms_1() public view {
        _checkValid(1);
    }

    function test_validPrograms_2() public view {
        _checkValid(2);
    }

    function test_validPrograms_3() public view {
        _checkValid(3);
    }

    function test_validPrograms_4() public view {
        _checkValid(4);
    }

    function test_validPrograms_5() public view {
        _checkValid(5);
    }

    function test_validPrograms_6() public view {
        _checkValid(6);
    }

    function test_validPrograms_7() public view {
        _checkValid(7);
    }

    // --------------------------------------------------------- invalid programs

    /// @dev Error name -> whether it carries a `uint256` argument.
    function _hasIndex(string memory rule) private pure returns (bool) {
        bytes32 id = keccak256(bytes(rule));
        return id == keccak256("BadOpcode") || id == keccak256("UnusedFieldNotZero")
            || id == keccak256("OperandNotEarlier") || id == keccak256("BadInputIndex")
            || id == keccak256("BadOutputIndex") || id == keccak256("DeadNode");
    }

    /// @dev Revert data for the error named in the fixture, derived from its name alone so a rename
    ///      or signature change in VM.sol shows up here.
    function _expectedRevert(InvalidRow memory r) private pure returns (bytes memory) {
        bool withIndex = _hasIndex(r.rule);
        bytes4 selector =
            bytes4(keccak256(bytes(string.concat(r.rule, withIndex ? "(uint256)" : "()"))));
        return withIndex ? abi.encodeWithSelector(selector, r.index) : abi.encodePacked(selector);
    }

    function _checkInvalid(uint256 n) private view {
        InvalidRow[] memory rows = abi.decode(_slice(".invalid", INVALID_CHUNK, n), (InvalidRow[]));
        assertEq(rows.length, INVALID_CHUNK, "fixture looks truncated");

        for (uint256 i; i < rows.length; ++i) {
            uint256 row = n * INVALID_CHUNK + i;
            try h.validate(_bytes(rows[i].program)) {
                revert(_msg(string.concat("expected ", rows[i].rule, " but validate passed"), row));
            } catch (bytes memory reason) {
                assertEq(reason, _expectedRevert(rows[i]), _msg(rows[i].rule, row));
            }
        }
    }

    function test_invalidPrograms_0() public view {
        _checkInvalid(0);
    }

    function test_invalidPrograms_1() public view {
        _checkInvalid(1);
    }

    // ------------------------------------------------------------------ vectors

    function _checkVectors(uint256 n) private view {
        VectorRow[] memory rows = abi.decode(_slice(".vectors", VECTOR_CHUNK, n), (VectorRow[]));
        assertEq(rows.length, VECTOR_CHUNK, "fixture looks truncated");

        for (uint256 i; i < rows.length; ++i) {
            VectorRow memory r = rows[i];
            uint256 row = n * VECTOR_CHUNK + i;
            uint256[] memory xs = Puzzles.inputs(r.puzzleId, r.seed, r.trial);
            assertEq(abi.encode(xs), abi.encode(r.inputs), _msg("inputs", row));
            assertEq(
                abi.encode(Puzzles.referenceOutputs(r.puzzleId, xs)),
                abi.encode(r.expected),
                _msg("reference", row)
            );
        }
    }

    function test_inputsAndReference_0() public view {
        _checkVectors(0);
    }

    function test_inputsAndReference_1() public view {
        _checkVectors(1);
    }

    function test_inputsAndReference_2() public view {
        _checkVectors(2);
    }

    function test_inputsAndReference_3() public view {
        _checkVectors(3);
    }

    // ------------------------------------------------------------------- guard

    /// @dev One row past the last chunk must not exist, so a regenerated, larger fixture cannot
    ///      leave rows silently unchecked. An empty slice may come back empty or as a revert.
    function _assertNothingAfter(string memory key, uint256 count) private view {
        string memory path =
            string.concat(key, "[", vm.toString(count), ":", vm.toString(count + 1), "]");
        string memory json = vm.readFile("fixtures/diff.json");
        try vm.parseJson(json, path) returns (bytes memory data) {
            assertLe(data.length, 64, string.concat("rows beyond the chunks in ", key));
        } catch {}
    }

    function test_chunksCoverTheWholeFixture() public view {
        _assertNothingAfter(".valid", 8 * VALID_CHUNK);
        _assertNothingAfter(".invalid", 2 * INVALID_CHUNK);
        _assertNothingAfter(".vectors", 4 * VECTOR_CHUNK);
    }
}
