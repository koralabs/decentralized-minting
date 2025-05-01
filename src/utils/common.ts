import { HandlePriceInfo, HandlePrices } from "../contracts/index.js";

const calculateHandlePriceFromHandlePriceInfo = (
  handle: string,
  handlePriceInfo: HandlePriceInfo
): bigint => {
  const { current_data } = handlePriceInfo;
  const handleLength = handle.length;
  if (handleLength <= 1)
    throw new Error("Handle must be at least 2 characters");
  if (handleLength <= 2) return current_data[0];
  if (handleLength <= 3) return current_data[1];
  if (handleLength <= 7) return current_data[2];
  if (handleLength <= 15) return current_data[3];
  return current_data[3];
};

const calculateHandlePriceFromHandlePrices = (
  handle: string,
  handlePrices: HandlePrices
): number => {
  const handleLength = handle.length;
  if (handleLength <= 1)
    throw new Error("Handle must be at least 2 characters");
  if (handleLength <= 2) return handlePrices.ultraRare;
  if (handleLength <= 3) return handlePrices.rare;
  if (handleLength <= 7) return handlePrices.common;
  if (handleLength <= 15) return handlePrices.basic;
  return handlePrices.basic;
};

const calculateSubHandlePriceFromTierPricing = (
  subHandle: string,
  tierPricing: Array<Array<bigint>>
) => {
  const subHandleLength = subHandle.length;
  let initialPrice = 0n;
  for (const tier of tierPricing) {
    if (subHandleLength < Number(tier[0])) {
      return initialPrice;
    }
    initialPrice = tier[1];
  }
  return initialPrice;
};

const parseHandle = (
  handle: string
): { isSubHandle: boolean; rootHandle: string; subHandle: string } => {
  const atSymbolIndex = handle.indexOf("@");
  const isSubHandle = atSymbolIndex >= 0;

  if (isSubHandle) {
    return {
      isSubHandle: true,
      rootHandle: handle.slice(atSymbolIndex + 1),
      subHandle: handle.slice(0, atSymbolIndex),
    };
  } else {
    return {
      isSubHandle: false,
      rootHandle: "",
      subHandle: "",
    };
  }
};

export {
  calculateHandlePriceFromHandlePriceInfo,
  calculateHandlePriceFromHandlePrices,
  calculateSubHandlePriceFromTierPricing,
  parseHandle,
};
