import { describe, expect, it } from "vitest";

import {
  isImageUrlColumnHeader,
  looksLikeImageUrl,
  shouldRenderTableCellAsImage,
} from "@/lib/table-image-url-cell";

describe("table image url cell", () => {
  it("detects image url column headers", () => {
    expect(isImageUrlColumnHeader("图片URL")).toBe(true);
    expect(isImageUrlColumnHeader("image url")).toBe(true);
    expect(isImageUrlColumnHeader("asin")).toBe(false);
  });

  it("detects amazon image urls", () => {
    const url = "https://images-na.ssl-images-amazon.com/images/I/71zzfholgrL._AC_US200_.jpg";
    expect(looksLikeImageUrl(url)).toBe(true);
    expect(shouldRenderTableCellAsImage("图片URL", url)).toBe(true);
  });

  it("does not render plain product page urls as images", () => {
    expect(
      shouldRenderTableCellAsImage(
        "亚马逊asin的详情网址",
        "https://www.amazon.com/dp/B00ZZT7D7V",
      ),
    ).toBe(false);
  });
});
