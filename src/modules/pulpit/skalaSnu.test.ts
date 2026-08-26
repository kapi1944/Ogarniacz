import { describe, expect, it } from "vitest";
import {
  DOMYSLNE_USTAWIENIA_SNU_OSI,
  KOMPRESJA_SNU,
  czasNaMinuty,
  normalizujUstawieniaSnuOsi,
} from "./skalaSnu";

describe("skala snu osi czasu", () => {
  it("ma domyślny sen 22:30–06:30 i kompresję 50%", () => {
    expect(DOMYSLNE_USTAWIENIA_SNU_OSI).toEqual({
      poczatek: "22:30",
      koniec: "06:30",
    });
    expect(KOMPRESJA_SNU).toBe(0.5);
  });

  it("rozpoznaje poprawne godziny", () => {
    expect(czasNaMinuty("06:30")).toBe(390);
    expect(czasNaMinuty("22:30")).toBe(1350);
    expect(czasNaMinuty("24:00")).toBeNull();
  });

  it("odrzuca zerowy lub uszkodzony zakres snu", () => {
    expect(
      normalizujUstawieniaSnuOsi({
        poczatek: "10:00",
        koniec: "10:00",
      }),
    ).toEqual(DOMYSLNE_USTAWIENIA_SNU_OSI);

    expect(
      normalizujUstawieniaSnuOsi({
        poczatek: "xx",
        koniec: "06:30",
      }),
    ).toEqual(DOMYSLNE_USTAWIENIA_SNU_OSI);
  });
});
