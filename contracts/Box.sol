//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import 'hardhat/console.sol';

contract Box {
    uint256 public i;

    function setValue(uint256 j) public {
        i += j;
    }

    function getEncodedSetValue() public pure returns (bytes memory) {
        return abi.encodeWithSignature('setValue(uint256)', 666);
    }
}
