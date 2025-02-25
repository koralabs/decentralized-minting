import { Store, Trie } from "@aiken-lang/merkle-patricia-forestry";
import {
  BlockfrostV0Client,
  makeBlockfrostV0Client,
  NetworkName,
} from "@helios-lang/tx-utils";
import { existsSync } from "fs";

import { BLOCKFROST_API_KEY, NETWORK } from "../../src/constants/index.js";

class CommandImpl {
  storePath: string;
  mpt: Trie | null;
  blockfrostCardanoClient: BlockfrostV0Client;
  running = true;

  constructor(storePath: string) {
    this.storePath = storePath;
    this.blockfrostCardanoClient = makeBlockfrostV0Client(
      NETWORK as NetworkName,
      BLOCKFROST_API_KEY
    );
    this.mpt = null;
  }

  async loadMPT() {
    if (existsSync(this.storePath)) {
      this.mpt = await Trie.load(new Store(this.storePath));
      console.log("Database exists, current state: ");
      console.log(this.mpt);
    } else {
      console.log("Database not exists");
    }
  }
}

export { CommandImpl };
