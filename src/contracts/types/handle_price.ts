// [ultraRare, rare, common, basic]
type HandlePriceData = bigint[];

type HandlePriceInfo = {
  current_data: HandlePriceData;
  prev_data: HandlePriceData;
  updated_at: bigint;
};

// this is human readable handle prices
// in ada
type HandlePrices = {
  basic: number;
  common: number;
  rare: number;
  ultraRare: number;
};

const convertHandlePricesToHandlePriceData = (
  handlePrices: HandlePrices
): HandlePriceData => {
  return [
    BigInt(handlePrices.ultraRare * 1_000_000),
    BigInt(handlePrices.rare * 1_000_000),
    BigInt(handlePrices.common * 1_000_000),
    BigInt(handlePrices.basic * 1_000_000),
  ];
};

export type { HandlePriceData, HandlePriceInfo, HandlePrices };
export { convertHandlePricesToHandlePriceData };
