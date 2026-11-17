import { describe } from "vite-plus/test";
import { kindValueTests } from "./deep-cases.ts";

describe("values of any depth (Codec R1, R4, R6; Actors R18, R19)", () => {
  kindValueTests([["Tree", "deep"]]);
});
