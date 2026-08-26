import { useState } from "react";
import {
  DOMYSLNE_USTAWIENIA_SNU_OSI,
  pobierzUstawieniaSnuOsi,
  zapiszUstawieniaSnuOsi,
  type UstawieniaSnuOsi,
} from "./skalaSnu";

export function KontrolkaSnuOsi() {
  const [wartosc, ustawWartosc] = useState<UstawieniaSnuOsi>(
    () => pobierzUstawieniaSnuOsi(),
  );

  const zapisz = () => {
    const zapisane = zapiszUstawieniaSnuOsi(wartosc);
    ustawWartosc(zapisane);

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  const resetuj = () => {
    const domyslne = { ...DOMYSLNE_USTAWIENIA_SNU_OSI };
    ustawWartosc(domyslne);
    zapiszUstawieniaSnuOsi(domyslne);

    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div className="kontrolka-snu-osi" aria-label="Ustawienia snu na osi czasu">
      <span className="kontrolka-snu-osi__tytul">Sen</span>

      <label>
        <span>od</span>
        <input
          type="time"
          value={wartosc.poczatek}
          onChange={(event) =>
            ustawWartosc((poprzednie) => ({
              ...poprzednie,
              poczatek: event.target.value,
            }))
          }
          aria-label="Początek snu"
        />
      </label>

      <label>
        <span>do</span>
        <input
          type="time"
          value={wartosc.koniec}
          onChange={(event) =>
            ustawWartosc((poprzednie) => ({
              ...poprzednie,
              koniec: event.target.value,
            }))
          }
          aria-label="Koniec snu"
        />
      </label>

      <button type="button" className="przycisk drugorzedny" onClick={zapisz}>
        Zapisz sen
      </button>

      <button type="button" className="przycisk drugorzedny" onClick={resetuj}>
        22:30–06:30
      </button>

      <span className="kontrolka-snu-osi__opis">
        ten zakres ma 50% normalnej skali
      </span>
    </div>
  );
}
