import { CompletionItem, CompletionItemKind, Connection, Diagnostic, DiagnosticSeverity, InsertTextFormat, Location, Position, TextDocumentPositionParams } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { buildEnvironment, Environment, Node, validate } from 'wollok-ts'
import { Problem } from 'wollok-ts'
import { completionsForNode, NodeCompletion } from './autocomplete'
import { reportMessage } from './reporter'
import { TimeMeasurer } from './timeMeasurer'
import { updateDocumentSettings } from './settings'
import { getNodesByPosition, nodeToLocation } from './utils/text-documents'
import { getNodeDefinition } from './definition'

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// INTERNAL FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const buildSeverity = (problem: Problem) =>
  problem.level === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning

const createDiagnostic = (textDocument: TextDocument, problem: Problem) => {
  const source = problem.sourceMap
  const range = {
    start: textDocument.positionAt(source ? source.start.offset : 0),
    end: textDocument.positionAt(source ? source.end.offset : 0),
  }
  return {
    severity: buildSeverity(problem),
    range,
    code: problem.code,
    message: reportMessage(problem),
    source: problem.node.sourceFileName(),
  } as Diagnostic
}

const createCompletionItem = (_position: Position) => (base: NodeCompletion): CompletionItem => ({
  kind: CompletionItemKind.Method,
  sortText: 'b',
  insertTextFormat: InsertTextFormat.Snippet,
  insertText: base.textEdit.newText,
  label: base.label,
})

function findFirstStableNode(node: Node): Node {
  if(!node.problems){
    return node
  }
  if(node.parent.kind === 'Environment'){
    throw new Error('No stable node found')
  }
  return findFirstStableNode(node.parent)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// PUBLIC INTERFACE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

let environment: Environment

export const validateTextDocument = (connection: Connection) => async (textDocument: TextDocument): Promise<void> => {
  await updateDocumentSettings(connection)

  const text = textDocument.getText()
  try {
    const timeMeasurer = new TimeMeasurer()

    environment = buildEnvironment([])
    timeMeasurer.addTime('build empty environment')

    const file: { name: string, content: string } = {
      name: textDocument.uri,
      content: text,
    }
    environment = buildEnvironment([file], environment)
    const problems = validate(environment)
    timeMeasurer.addTime('build environment for file')

    const diagnostics: Diagnostic[] = problems.map(problem => createDiagnostic(textDocument, problem))
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics })
    timeMeasurer.addTime('validation time')

    timeMeasurer.finalReport()
  } catch (e) {
    // TODO: Generate a high-level function
    connection.sendDiagnostics({
      uri: textDocument.uri, diagnostics: [
        createDiagnostic(textDocument, {
          level: 'error',
          code: 'FileHasParsingProblems',
          node: { sourceFileName: () => textDocument.uri },
          values: [],
          sourceMap: {
            start: {
              line: 1,
              offset: 0,
            }, end: {
              line: Number.MAX_VALUE,
              offset: text.length - 1,
            },
          },
        } as unknown as Problem),
      ],
    })
    connection.console.error('programa: ' + text)
    connection.console.error((e as { message: string}).message)
  }
}

export const completions = (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
  const { position } = textDocumentPosition
  const cursorNode = getNodesByPosition(environment, textDocumentPosition).reverse()[0]
  const stableNode = findFirstStableNode(cursorNode)
  return completionsForNode(stableNode).map(createCompletionItem(position))
}

export const definition = (textDocumentPosition: TextDocumentPositionParams): Location => {
  const cursorNode = getNodesByPosition(environment, textDocumentPosition).reverse()[0]
  const definition = getNodeDefinition(cursorNode)
  return nodeToLocation(definition)
}