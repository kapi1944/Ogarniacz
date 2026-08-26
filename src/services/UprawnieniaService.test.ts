import { describe, expect, it } from 'vitest'
import { utworzMetadane } from '../domain/fabryki'
import type { Uprawnienie } from '../domain/typy'
import { czyDozwolone } from './UprawnieniaService'

const grant: Uprawnienie = { ...utworzMetadane(), owner: 'wlasciciel', editorId: 'edytor-1', modul: 'zadania', odczyt: true, edycja: false, status: 'aktywne' }

describe('permission engine', () => {
  it('Właściciel ma pełny dostęp', () => expect(czyDozwolone('wlasciciel', [], 'leki', 'edycja')).toBe(true))
  it('Edytor bez uprawnienia nie ma dostępu', () => expect(czyDozwolone('edytor', [], 'zadania', 'odczyt', 'edytor-1')).toBe(false))
  it('Edytor z read może odczytać moduł', () => expect(czyDozwolone('edytor', [grant], 'zadania', 'odczyt', 'edytor-1')).toBe(true))
  it('Edytor bez edit nie może edytować', () => expect(czyDozwolone('edytor', [grant], 'zadania', 'edycja', 'edytor-1')).toBe(false))
  it('Edytor z edit może edytować', () => expect(czyDozwolone('edytor', [{ ...grant, edycja: true }], 'zadania', 'edycja', 'edytor-1')).toBe(true))
})
