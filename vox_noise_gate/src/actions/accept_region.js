import { commitActive } from "./regions";

export const acceptRegionChange = async (get, set) => {
  commitActive(get, set);
};
