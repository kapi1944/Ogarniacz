export * from '../../server/wspolne/modeleFinansowWspolnych.ts'
import type * as ModeleFinansowe from '../../server/wspolne/modeleFinansowWspolnych.ts'
import type { EncjaBazowa } from './typy'

export type WspolnaKasa = ModeleFinansowe.WspolnaKasa & EncjaBazowa
export type OperacjaKasy = ModeleFinansowe.OperacjaKasy & EncjaBazowa
export type Rozliczenie = ModeleFinansowe.Rozliczenie & EncjaBazowa
export type WydatekGrupowy = ModeleFinansowe.WydatekGrupowy & EncjaBazowa
export type ZwrotRozliczenia = ModeleFinansowe.ZwrotRozliczenia & EncjaBazowa
