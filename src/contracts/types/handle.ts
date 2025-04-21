import { Destination } from "./order.js";

interface Handle {
  // without asset name label
  hexName: string;
  utf8Name: string;
  destination: Destination;
  isLegacy: boolean;
  isVirtual: boolean;
}

export type { Handle };
