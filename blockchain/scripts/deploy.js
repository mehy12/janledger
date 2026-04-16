const { ethers } = require("hardhat");

async function main() {
  const Contract = await ethers.getContractFactory("ComplaintLedger");
  const contract = await Contract.deploy();

  await contract.waitForDeployment();

  console.log("Deployed to:", contract.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
