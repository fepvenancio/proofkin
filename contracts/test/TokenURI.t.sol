// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Base64} from "solady/utils/Base64.sol";
import {LibString} from "solady/utils/LibString.sol";
import {Renderer} from "../src/Renderer.sol";
import {MockProofkin} from "./helpers/MockProofkin.sol";
import {Prog} from "./helpers/Prog.sol";

/// @notice `Renderer.tokenURI` (PLAN.md §5.3 traits, §6 metadata) against a mock collection.
contract TokenURITest is Test {
    string constant JSON_PREFIX = "data:application/json;base64,";
    string constant SVG_PREFIX = "data:image/svg+xml;base64,";
    string constant GOLD_RING =
        '<circle cx="300" cy="300" r="292" fill="none" stroke="hsl(46,85%,58%)" stroke-opacity=".6" stroke-width="2"/>\n';
    string constant BACKGROUND = '<rect width="600" height="600" fill="url(#g)"/>\n';

    bytes32 constant SEED = 0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8ff9;

    Renderer r = new Renderer();
    MockProofkin proofkin = new MockProofkin(r);

    // ------------------------------------------------------------------ helpers

    function _solution(string memory name) private view returns (bytes memory) {
        return vm.parseJsonBytes(vm.readFile("fixtures/solutions.json"), string.concat(".", name));
    }

    function _json(string memory uri) private pure returns (string memory) {
        assertTrue(LibString.startsWith(uri, JSON_PREFIX), "JSON data URI");
        return string(Base64.decode(LibString.slice(uri, bytes(JSON_PREFIX).length)));
    }

    function _image(string memory json) private pure returns (string memory) {
        string memory uri = vm.parseJsonString(json, ".image");
        assertTrue(LibString.startsWith(uri, SVG_PREFIX), "SVG data URI");
        return string(Base64.decode(LibString.slice(uri, bytes(SVG_PREFIX).length)));
    }

    function _meta(uint256 id) private view returns (string memory) {
        return _json(proofkin.tokenURI(id));
    }

    function _traitName(string memory json, uint256 i) private pure returns (string memory) {
        return
            vm.parseJsonString(json, string.concat(".attributes[", vm.toString(i), "].trait_type"));
    }

    function _traitText(string memory json, uint256 i) private pure returns (string memory) {
        return vm.parseJsonString(json, string.concat(".attributes[", vm.toString(i), "].value"));
    }

    function _traitNumber(string memory json, uint256 i) private pure returns (uint256) {
        return vm.parseJsonUint(json, string.concat(".attributes[", vm.toString(i), "].value"));
    }

    /// @dev Trait indices in the order the contract emits them.
    uint256 constant PUZZLE = 0;
    uint256 constant NODES = 1;
    uint256 constant DEPTH = 2;
    uint256 constant RANK = 3;
    uint256 constant FIRST_SOLVER = 4;
    uint256 constant RECORD_SETTER = 5;
    uint256 constant OPTIMAL = 6;
    uint256 constant FAMILY = 7;

    function _mintSort8(uint256 id, uint16 rank, bool record)
        private
        returns (bytes memory program)
    {
        program = _solution("SORT8");
        proofkin.mint(id, program, SEED, 6, rank, record);
    }

    // ------------------------------------------------------------------ document

    function test_metadataFields() public {
        _mintSort8(7, 3, false);
        string memory json = _meta(7);
        assertEq(vm.parseJsonString(json, ".name"), "Proofkin #7");
        assertGt(bytes(vm.parseJsonString(json, ".description")).length, 40, "description");
        assertTrue(vm.keyExistsJson(json, ".attributes[7]"), "eight traits");
        assertFalse(vm.keyExistsJson(json, ".attributes[8]"), "and no more");
        assertTrue(LibString.startsWith(vm.parseJsonString(json, ".image"), SVG_PREFIX));
    }

    function test_imageIsTheRenderOfTheStoredProgramAndSeed() public {
        bytes memory program = _mintSort8(1, 1, true);
        assertEq(_image(_meta(1)), r.render(program, SEED));
    }

    // ------------------------------------------------------------------ traits

    function test_traitsOfASolvedToken() public {
        _mintSort8(12, 3, true);
        proofkin.setBest(2, 40); // someone found a 40-node SORT8 since

        string memory json = _meta(12);
        string[8] memory names = [
            "Puzzle",
            "Nodes",
            "Depth",
            "Solve rank",
            "First Solver",
            "Record Setter",
            "Optimal",
            "Dominant op family"
        ];
        for (uint256 i; i < 8; ++i) {
            assertEq(_traitName(json, i), names[i], "trait order");
        }

        assertEq(_traitText(json, PUZZLE), "SORT8");
        assertEq(_traitNumber(json, NODES), 46, "8 IN + 19 comparators x 2");
        assertEq(_traitNumber(json, DEPTH), 6, "the token's stored depth");
        assertEq(_traitNumber(json, RANK), 3);
        assertEq(_traitText(json, FIRST_SOLVER), "No");
        assertEq(_traitText(json, RECORD_SETTER), "Yes");
        assertEq(_traitText(json, OPTIMAL), "No", "40 < 46");
        assertEq(_traitText(json, FAMILY), "Compare");
    }

    function test_firstSolverIsRankOne() public {
        _mintSort8(1, 1, true);
        _mintSort8(2, 2, false);
        assertEq(_traitText(_meta(1), FIRST_SOLVER), "Yes");
        assertEq(_traitText(_meta(2), FIRST_SOLVER), "No");
        assertEq(_traitText(_meta(1), RECORD_SETTER), "Yes");
        assertEq(_traitText(_meta(2), RECORD_SETTER), "No");
    }

    function test_puzzleTraitNamesAllSixPuzzles() public {
        string[6] memory names =
            ["QUORUM7", "MEDIAN5", "SORT8", "GRID_PATH", "KNAPSACK3", "FAIR_SPLIT4"];
        uint8[6] memory outs = [1, 1, 8, 1, 1, 4];
        for (uint8 p; p < 6; ++p) {
            bytes memory program = Prog.build(p, Prog.konst(9), new bytes(outs[p]));
            proofkin.mint(p + 1, program, SEED, 0, 1, false);
            assertEq(_traitText(_meta(p + 1), PUZZLE), names[p], names[p]);
        }
    }

    // ------------------------------------------------------------------ optimal is live

    function test_optimalFollowsBestNodesAndAddsAGoldRing() public {
        bytes memory program = _mintSort8(5, 1, true);
        string memory plain = r.render(program, SEED);

        // best is still the initial 255: not optimal, and no ring
        string memory json = _meta(5);
        assertEq(_traitText(json, OPTIMAL), "No");
        assertEq(_image(json), plain);

        // a record equal to this token's size makes it optimal
        proofkin.setBest(2, 46);
        json = _meta(5);
        assertEq(_traitText(json, OPTIMAL), "Yes");
        assertEq(
            _image(json),
            LibString.replace(plain, BACKGROUND, string.concat(BACKGROUND, GOLD_RING)),
            "gold ring only"
        );

        // someone beats it: no longer optimal, the ring goes away again
        proofkin.setBest(2, 45);
        json = _meta(5);
        assertEq(_traitText(json, OPTIMAL), "No");
        assertEq(_image(json), plain);
    }

    function test_optimalIsPerPuzzle() public {
        _mintSort8(5, 1, true);
        proofkin.setBest(0, 46); // QUORUM7's record is irrelevant to a SORT8 token
        assertEq(_traitText(_meta(5), OPTIMAL), "No");
    }

    // ------------------------------------------------------------------ dominant family

    function _family(bytes memory program) private returns (string memory) {
        proofkin.mint(100, program, SEED, 0, 1, false);
        return _traitText(_meta(100), FAMILY);
    }

    function test_dominantFamilyOfTheFixtureCircuits() public {
        assertEq(_family(_solution("QUORUM7")), "Arithmetic", "6 ADD vs LT, EQ");
        assertEq(_family(_solution("SORT8")), "Compare", "19 MIN + 19 MAX");
        assertEq(_family(_solution("KNAPSACK3")), "Compare", "7 LT + 6 MAX beat 8 ADD and 7 SEL");
        assertEq(_family(_solution("FAIR_SPLIT4")), "Arithmetic", "3 ADD + 4 MUL + 4 DIV");
    }

    function test_dominantFamilyLogicSelectTieAndNone() public {
        // logic: AND, OR, AND
        bytes memory logic = bytes.concat(
            Prog.konst(1),
            Prog.konst(2),
            Prog.node(Prog.AND, 0, 1, 0),
            Prog.node(Prog.OR, 2, 0, 0),
            Prog.node(Prog.AND, 3, 1, 0)
        );
        assertEq(_family(Prog.build(Prog.QUORUM7, logic, Prog.out(4))), "Logic");

        // select: SEL, SEL beat one ADD
        bytes memory select = bytes.concat(
            Prog.konst(1),
            Prog.node(Prog.ADD, 0, 0, 0),
            Prog.node(Prog.SEL, 0, 1, 0),
            Prog.node(Prog.SEL, 2, 0, 1)
        );
        assertEq(_family(Prog.build(Prog.QUORUM7, select, Prog.out(3))), "Select");

        // tie between arithmetic and compare goes to the earlier family
        bytes memory tie =
            bytes.concat(Prog.konst(1), Prog.node(Prog.ADD, 0, 0, 0), Prog.node(Prog.MIN, 1, 0, 0));
        assertEq(_family(Prog.build(Prog.QUORUM7, tie, Prog.out(2))), "Arithmetic");

        // only IN/CONST nodes: none of the four families
        assertEq(_family(Prog.build(Prog.QUORUM7, Prog.konst(1), Prog.out(0))), "None");
    }

    // ------------------------------------------------------------------ errors

    function test_unknownTokenReverts() public {
        vm.expectRevert(Renderer.NoSuchToken.selector);
        proofkin.tokenURI(404);
    }
}
