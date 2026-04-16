// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ComplaintLedger {
    struct Record {
        string hash;
        uint timestamp;
    }

    Record[] public records;

    function storeHash(string memory _hash) public {
        records.push(Record(_hash, block.timestamp));
    }
}
