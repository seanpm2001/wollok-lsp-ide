import * as assert from 'assert'
import { Diagnostic, DiagnosticSeverity, languages, Position, Range, Uri } from 'vscode'
import { getDocumentURI, activate } from './helper'

suite('Should get diagnostics', () => {
  const docUri = getDocumentURI('pepita.wlk')

  test('Diagnoses lowercase names for objects', async () => {
    await testDiagnostics(docUri, [
      { message: 'The name  must start with lowercase', range: toRange(0, 7, 0, 13), severity: DiagnosticSeverity.Warning, source: 'ex' },
    ])
  })
})

function toRange(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
  const start = new Position(startLine, startCharacter)
  const end = new Position(endLine, endCharacter)
  return new Range(start, end)
}

async function testDiagnostics(docUri: Uri, expectedDiagnostics: Diagnostic[]) {
  await activate(docUri)

  const actualDiagnostics = languages.getDiagnostics(docUri)

  assert.equal(actualDiagnostics.length, expectedDiagnostics.length, 'Diagnostics length differ')

  expectedDiagnostics.forEach((expectedDiagnostic, i) => {
    const actualDiagnostic = actualDiagnostics[i]
    assert.equal(actualDiagnostic.message, expectedDiagnostic.message, 'Diagnostic message failed')
    assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range, 'Diagnostic range failed')
    assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity, 'Diagnostic severity failed')
  })
}