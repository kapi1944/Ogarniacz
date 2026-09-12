export function zapiszDiagnostykeEcho(
  zdarzenie: string,
  szczegoly: Record<string, unknown> = {},
): void {
  console.info('[Echo]', zdarzenie, szczegoly)
}
