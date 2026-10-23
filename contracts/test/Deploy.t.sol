// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "solady/auth/Ownable.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Proofkin} from "../src/Proofkin.sol";
import {Renderer} from "../src/Renderer.sol";
import {ProofkinBase} from "./helpers/ProofkinBase.sol";

/// @notice Milestone 5: the deploy script. Everything it can do without a network is tested here;
///         what it does on a real chain is rehearsed on a throwaway one (docs/M5-notes.md).
contract DeployTest is ProofkinBase {
    uint256 constant LOCAL = 31_337;
    uint256 constant BASE_SEPOLIA = 84_532;
    uint256 constant BASE = 8453;

    address constant PROOFKIN = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
    address constant RENDERER = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512;

    Deploy script;

    function setUp() public {
        script = new Deploy();
    }

    // ------------------------------------------------------------ what it deploys

    function test_deploysBothContractsWithTheLaunchSettings() public {
        (Proofkin p, Renderer r) = script.deploy(owner, false);

        assertGt(address(p).code.length, 0, "Proofkin has code");
        assertGt(address(r).code.length, 0, "Renderer has code");
        assertEq(p.owner(), owner);
        assertEq(p.renderer(), address(r), "the collection reads its own renderer");
        assertEq(p.mintPrice(), 0.01 ether, "launch price");
        assertFalse(p.rendererLocked(), "locking is a later, deliberate step");
        assertEq(p.totalSupply(), 0);
    }

    function test_theLaunchPriceIsPointZeroOneEth() public view {
        assertEq(script.MINT_PRICE(), 0.01 ether);
    }

    /// Whoever sends the deployment holds no power afterwards: the owner is the one named.
    function test_theDeployerIsNotTheOwner() public {
        (Proofkin p,) = script.deploy(owner, false);

        assertTrue(owner != address(script) && owner != address(this) && owner != tx.origin);
        assertEq(p.owner(), owner);
        for (uint256 k; k < 3; ++k) {
            address nobody = k == 0 ? address(script) : k == 1 ? address(this) : tx.origin;
            vm.prank(nobody);
            vm.expectRevert(Ownable.Unauthorized.selector);
            p.setRenderer(address(1));
        }
    }

    /// The pair works together: a solution mints, the renderer draws it, and the owner can take the fee.
    function test_theDeployedPairMintsRendersAndPaysTheOwner() public {
        (Proofkin p, Renderer r) = script.deploy(owner, false);
        (proofkin, renderer) = (p, r);

        uint256 id = _mintAs(alice, _solution("QUORUM7"));
        string memory uri = p.tokenURI(id);
        assertEq(bytes(uri).length > 100, true);
        assertEq(_prefix(uri, 29), "data:application/json;base64,");

        uint256 before = owner.balance;
        vm.prank(owner);
        p.withdraw();
        assertEq(owner.balance - before, 0.01 ether, "the fee reaches the owner");
        assertEq(address(p).balance, 0);
    }

    function _prefix(string memory s, uint256 n) private pure returns (string memory out) {
        bytes memory b = bytes(s);
        bytes memory head = new bytes(n);
        for (uint256 i; i < n; ++i) {
            head[i] = b[i];
        }
        out = string(head);
    }

    // ---------------------------------------------------------------- the guards

    function test_aZeroOwnerIsRefused() public {
        vm.expectRevert(Deploy.OwnerRequired.selector);
        script.deploy(address(0), false);
    }

    function test_onlyLocalBaseSepoliaAndBaseAreAllowed() public {
        uint256[5] memory others = [uint256(1), 10, 137, 11_155_111, 42_161];
        for (uint256 k; k < others.length; ++k) {
            vm.chainId(others[k]);
            vm.expectRevert(abi.encodeWithSelector(Deploy.UnsupportedChain.selector, others[k]));
            script.deploy(owner, true);
        }

        vm.chainId(LOCAL);
        script.deploy(owner, false);
        vm.chainId(BASE_SEPOLIA);
        script.deploy(owner, false);
    }

    function test_baseMainnetNeedsAnExplicitConfirmation() public {
        vm.chainId(BASE);
        vm.expectRevert(Deploy.MainnetNotConfirmed.selector);
        script.deploy(owner, false);

        (Proofkin p,) = script.deploy(owner, true);
        assertEq(p.owner(), owner);
    }

    function test_theConfirmationMeansNothingOnTheTestnets() public {
        vm.chainId(BASE_SEPOLIA);
        script.deploy(owner, true);
        script.deploy(owner, false);
    }

    // ------------------------------------------------------------ the environment

    /// One test, so that nothing else sees what it sets: the environment belongs to the whole process.
    /// It assumes PROOFKIN_OWNER and PROOFKIN_CONFIRM_MAINNET are not set where the tests run.
    function test_runReadsTheOwnerAndTheMainnetConfirmationFromTheEnvironment() public {
        vm.expectRevert(Deploy.OwnerRequired.selector);
        script.run();

        vm.setEnv("PROOFKIN_OWNER", vm.toString(owner));
        (Proofkin p,) = script.run();
        assertEq(p.owner(), owner, "owner from PROOFKIN_OWNER");

        vm.chainId(BASE);
        vm.expectRevert(Deploy.MainnetNotConfirmed.selector);
        script.run();

        vm.setEnv("PROOFKIN_CONFIRM_MAINNET", "true"); // only the word "yes" counts
        vm.expectRevert(Deploy.MainnetNotConfirmed.selector);
        script.run();

        vm.setEnv("PROOFKIN_CONFIRM_MAINNET", "yes");
        (Proofkin onMainnet,) = script.run();
        assertEq(onMainnet.owner(), owner);
    }

    // ------------------------------------------------- what it prints for the playground

    /// The playground reads exactly these names (packages/playground/src/config.ts); a test there
    /// parses the same text.
    function test_theEnvBlockIsWhatTheCollectionNeedsToBeShownInThePlayground() public view {
        assertEq(
            script.envBlock(BASE_SEPOLIA, PROOFKIN, RENDERER, 123),
            string.concat(
                "VITE_CHAIN=baseSepolia\n",
                "VITE_PROOFKIN=0x5FbDB2315678afecb367f032d93F642f64180aa3\n",
                "VITE_RENDERER=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512\n",
                "VITE_DEPLOY_BLOCK=123"
            )
        );
        assertEq(
            script.envBlock(BASE, PROOFKIN, RENDERER, 45_000_000),
            string.concat(
                "VITE_CHAIN=base\n",
                "VITE_PROOFKIN=0x5FbDB2315678afecb367f032d93F642f64180aa3\n",
                "VITE_RENDERER=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512\n",
                "VITE_DEPLOY_BLOCK=45000000"
            )
        );
        assertEq(
            script.envBlock(LOCAL, PROOFKIN, RENDERER, 5),
            string.concat(
                "VITE_CHAIN=anvil\n",
                "VITE_PROOFKIN=0x5FbDB2315678afecb367f032d93F642f64180aa3\n",
                "VITE_RENDERER=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512\n",
                "VITE_DEPLOY_BLOCK=5"
            )
        );
    }
}
