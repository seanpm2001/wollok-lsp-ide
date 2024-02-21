import {
  Connection,
  Diagnostic,
  DiagnosticSeverity,
} from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { Environment, Problem, validate } from 'wollok-ts'
import { List } from 'wollok-ts/dist/extensions'
import { reportValidationMessage } from './functionalities/reporter'
import { updateDocumentSettings } from './settings'
import { TimeMeasurer } from './time-measurer'
import {
  trimIn,
} from './utils/text-documents'
import { isNodeURI, relativeFilePath, wollokURI } from './utils/vm/wollok'

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// INTERNAL FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const buildSeverity = (problem: Problem) =>
  problem.level === 'error'
    ? DiagnosticSeverity.Error
    : DiagnosticSeverity.Warning

const createDiagnostic = (textDocument: TextDocument, problem: Problem) => {
  const source = problem.sourceMap
  const range = {
    start: textDocument.positionAt(source ? source.start.offset : 0),
    end: textDocument.positionAt(source ? source.end.offset : 0),
  }

  return {
    severity: buildSeverity(problem),
    range: trimIn(range, textDocument),
    code: problem.code,
    message: reportValidationMessage(problem),
    source: '',
  } as Diagnostic
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PUBLIC INTERFACE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const sendDiagnostics = (
  connection: Connection,
  problems: List<Problem>,
  documents: TextDocument[],
): void => {
  for (const document of documents) {
    const diagnostics: Diagnostic[] = problems
      .filter((problem) => isNodeURI(problem.node, document.uri))
      .map((problem) => createDiagnostic(document, problem))

    const uri = wollokURI(document.uri)
    connection.sendDiagnostics({ uri, diagnostics })
  }
}

export const validateTextDocument =
  (connection: Connection, allDocuments: TextDocument[]) =>
  (textDocument: TextDocument) =>
  async (environment: Environment): Promise<void> => {
    await updateDocumentSettings(connection)

    try {
      const documentUri = relativeFilePath(textDocument.uri)
      const timeMeasurer = new TimeMeasurer()
      const problems = validate(environment)
      sendDiagnostics(connection, problems, allDocuments)
      timeMeasurer.addTime(`Validating ${documentUri}`)
      timeMeasurer.finalReport()
    } catch (e) {
      generateErrorForFile(connection, textDocument)
    }
  }


export const generateErrorForFile = (connection: Connection, textDocument: TextDocument): void => {
  const documentUri = wollokURI(textDocument.uri)
  const content = textDocument.getText()

  connection.sendDiagnostics({
    uri: documentUri,
    diagnostics: [
      createDiagnostic(textDocument, {
        level: 'error',
        code: 'FileCouldNotBeValidated',
        node: { sourceFileName: () => documentUri },
        values: [],
        sourceMap: {
          start: {
            line: 1,
            offset: 0,
          },
          end: {
            line: Number.MAX_VALUE,
            offset: content.length - 1,
          },
        },
      } as unknown as Problem),
    ],
  })
}