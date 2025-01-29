import { stringify } from "flatted";

const convertError = (item: unknown): string => {
  if (typeof item === "undefined") {
    return "undefined";
  }

  if (
    item &&
    typeof item === "object" &&
    "message" in item &&
    typeof item.message === "string"
  )
    return item.message;

  if (typeof item === "string") return item;

  const stringified = (() => {
    try {
      return stringify(item).slice(1).slice(0, -1);
    } catch {
      return String(item);
    }
  })();

  return stringified.replace(/^'|'$/g, "");
};

export default convertError;
