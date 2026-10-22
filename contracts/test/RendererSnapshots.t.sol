// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Renderer} from "../src/Renderer.sol";

/// @notice Byte-exact snapshots of `Renderer.render` for the six fixture circuits, in
///         fixtures/renders/<PUZZLE>.svg. Any change to the art shows up as a diff there.
///         After an intended change, regenerate with `UPDATE_SNAPSHOTS=true forge test --match-contract RendererSnapshotTest`
///         and review the SVGs.
contract RendererSnapshotTest is Test {
    Renderer r = new Renderer();

    /// @dev Last byte 0xf9 gives a hue shift of 9; the other bytes give every layer a different offset.
    bytes32 constant SEED = 0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8ff9;

    function _check(string memory name) private {
        bytes memory program =
            vm.parseJsonBytes(vm.readFile("fixtures/solutions.json"), string.concat(".", name));
        string memory svg = r.render(program, SEED);
        string memory path = string.concat("fixtures/renders/", name, ".svg");

        if (vm.envOr("UPDATE_SNAPSHOTS", false)) {
            vm.writeFile(path, svg);
        } else {
            assertEq(svg, vm.readFile(path), string.concat(name, " differs from its snapshot"));
        }
    }

    function test_snapshot_QUORUM7() public {
        _check("QUORUM7");
    }

    function test_snapshot_MEDIAN5() public {
        _check("MEDIAN5");
    }

    function test_snapshot_SORT8() public {
        _check("SORT8");
    }

    function test_snapshot_GRID_PATH() public {
        _check("GRID_PATH");
    }

    function test_snapshot_KNAPSACK3() public {
        _check("KNAPSACK3");
    }

    function test_snapshot_FAIR_SPLIT4() public {
        _check("FAIR_SPLIT4");
    }
}
