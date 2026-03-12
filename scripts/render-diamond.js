import { network } from "hardhat";
import fs from "fs";
const { ethers } = await network.connect();

async function main() {
  const [owner, alice] = await ethers.getSigners();

  const core = await ethers.deployContract("ExoskeletonCore", [owner.address]);
  const renderer = await ethers.deployContract("ExoskeletonRendererV2", [await core.getAddress()]);
  await core.setRenderer(await renderer.getAddress());
  await core.setWhitelist(alice.address, true);

  const configs = [
    { name: "Ollie", config: new Uint8Array([0x00, 0x00, 0x87, 0x78, 0xd2, 0xa5, 0x46, 0x01, 0x05]) },
    { name: "Roy Batty", config: new Uint8Array([0x03, 0x8c, 0xc8, 0xff, 0xff, 0xc8, 0x64, 0x04, 0x04]) },
    { name: "Pris", config: new Uint8Array([0x05, 0xff, 0x50, 0xc8, 0xc8, 0xc8, 0xc8, 0x03, 0x03]) },
    { name: "K", config: new Uint8Array([0x00, 0xc8, 0xa0, 0x50, 0x64, 0x78, 0x96, 0x06, 0x01]) },
  ];

  const signers = await ethers.getSigners();
  // Use different signers to avoid mint limit (3 per wallet)
  for (let i = 0; i < configs.length; i++) {
    const signer = signers[i + 1]; // skip owner
    await core.setWhitelist(signer.address, true);
    await core.connect(signer).mint(configs[i].config, { value: 0 });
  }
  // 5th token for messaging target
  const targetSigner = signers[5];
  await core.setWhitelist(targetSigner.address, true);
  await core.connect(targetSigner).mint(ethers.toUtf8Bytes("target"), { value: 0 });

  for (let i = 0; i < configs.length; i++) {
    const signer = signers[i + 1];
    await core.connect(signer).setName(i + 1, configs[i].name);
  }

  for (let t = 1; t <= 4; t++) {
    const signer = signers[t];
    console.log(`Generating Diamond activity for token ${t} (${configs[t-1].name})...`);

    for (let i = 0; i < 8; i++) {
      const modName = ethers.keccak256(ethers.toUtf8Bytes(`mod-${t}-${i}`));
      await core.registerModule(modName, signer.address, false, 0);
      await core.connect(signer).activateModule(t, modName);
    }

    for (let i = 0; i < 200; i++) {
      const key = ethers.keccak256(ethers.toUtf8Bytes(`k-${t}-${i}`));
      await core.connect(signer).setData(t, key, ethers.toUtf8Bytes("v"));
    }

    const channel = ethers.keccak256(ethers.toUtf8Bytes("ch"));
    for (let i = 0; i < 187; i++) {
      await core.connect(signer).sendMessage(t, 5, channel, 0, ethers.toUtf8Bytes("m"));
    }
  }

  // 6 days of age rings (all 6 rings visible): 6 * 43200 = 259200 = 0x3F480
  await ethers.provider.send("hardhat_mine", ["0x3F480"]);

  for (let t = 1; t <= 4; t++) {
    const svg = await renderer.renderSVG(t);
    const html = `<!DOCTYPE html><html><head><title>${configs[t-1].name} — Diamond</title><style>body{margin:0;background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh}</style></head><body>${svg}</body></html>`;
    fs.writeFileSync(`/tmp/diamond-${t}.html`, html);
    console.log(`Saved diamond-${t}.html (${configs[t-1].name}) — ${svg.length} chars`);
  }
}

main().catch(console.error);
