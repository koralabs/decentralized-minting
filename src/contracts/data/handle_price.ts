import { invariant } from "../../helpers/index.js";
import { HandlePriceData, HandlePriceInfo } from "../types/index.js";
import {
  expectConstr,
  expectInt,
  expectList,
  mkConstr,
  mkInt,
  mkList,
  PlutusData,
  plutusDataFromCbor,
} from "./plutusData.js";

const buildHandlePriceInfoData = (
  handlePriceInfo: HandlePriceInfo,
): PlutusData => {
  const { current_data, prev_data, updated_at } = handlePriceInfo;
  return mkConstr(0, [
    buildHandlePriceData(current_data),
    buildHandlePriceData(prev_data),
    mkInt(updated_at),
  ]);
};

const buildHandlePriceData = (handlePriceData: HandlePriceData): PlutusData => {
  invariant(
    handlePriceData.length == 4,
    "Handle Price Data must be 4, ultraRare, rare, common, basic",
  );
  return mkList(handlePriceData.map((v) => mkInt(v)));
};

const decodeHandlePriceInfoDatum = (
  datumCbor: string | undefined,
): HandlePriceInfo => {
  invariant(datumCbor, "HandlePriceInfo datum must have inline datum CBOR");
  const data = plutusDataFromCbor(datumCbor);
  const constr = expectConstr(data, 0, 3, "HandlePriceInfo");

  const current_data = expectList(
    constr.fields.items[0],
    "handle price info current data must be List",
  ).map((item) => expectInt(item));

  const prev_data = expectList(
    constr.fields.items[1],
    "handle price info prev data must be List",
  ).map((item) => expectInt(item));

  const updated_at = expectInt(
    constr.fields.items[2],
    "handle price info updated_at must be Int",
  );

  return { current_data, prev_data, updated_at };
};

export {
  buildHandlePriceData,
  buildHandlePriceInfoData,
  decodeHandlePriceInfoDatum,
};
