import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Miejsce } from '../domain/typy'
import { utworzZadanie } from './ZadaniaService'
import { pobierzSprawyWedlugMiejsca } from './MiejscaService'

describe('sprawy według miejsca', () => {
  it('pokazuje w Na mieście zadanie powiązane przez miejsceId', () => {
    const miejsce: Miejsce = {
      ...utworzMetadane('apteka-1'),
      nazwa: 'Apteka',
      adres: 'Rynek 1',
      typ: 'apteka',
    }
    const zadanie = {
      ...utworzZadanie({ tytul: 'Odebrać lek', opis: '' }),
      miejsceId: miejsce.id,
    }
    expect(pobierzSprawyWedlugMiejsca([zadanie], [miejsce], {})).toEqual([zadanie])
  })
})
