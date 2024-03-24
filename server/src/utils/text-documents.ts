import * as fs from 'fs'
import * as path from 'path'
import { Location, Position, Range, TextDocumentIdentifier, TextDocumentPositionParams } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { Environment, FileContent, Node, PROGRAM_FILE_EXTENSION, Package, SourceIndex, SourceMap, TEST_FILE_EXTENSION, WOLLOK_FILE_EXTENSION } from 'wollok-ts'

// TODO: Refactor
const include = (node: Node, { position, textDocument: { uri } }: TextDocumentPositionParams) => {
  if (!node.sourceFileName) return false
  if (node.kind === 'Package') {
    return uri.includes(node.sourceFileName)
  }
  if (!node.sourceMap) return false

  const startPosition = toVSCPosition(node.sourceMap.start)
  const endPosition = toVSCPosition(node.sourceMap.end)

  return uri.includes(node.sourceFileName!)
    && node.sourceMap
    && between(position, startPosition, endPosition)
}

export const between = (pointer: Position, start: Position, end: Position): boolean => {
  const { line: linePointer, character: charPointer } = pointer
  const { line: lineStart, character: charStart } = start
  const { line: lineEnd, character: charEnd } = end

  if (lineStart === lineEnd && linePointer === lineStart) {
    return charPointer >= charStart && charPointer <= charEnd
  }

  return linePointer > lineStart
    && linePointer < lineEnd
    || (linePointer === lineStart
      && charPointer >= charStart
      || linePointer === lineEnd
      && charPointer <= charEnd)
}

export const getNodesByPosition = (environment: Environment, textDocumentPosition: TextDocumentPositionParams): Node[] => {
  return environment.descendants.filter(node => !!node.sourceFileName && include(node, textDocumentPosition))
}

export const toVSCPosition = (position: SourceIndex): Position =>
  Position.create(
    Math.max(0, position.line - 1),
    Math.max(0, position.column - 1)
  )


export const toVSCRange = (sourceMap: SourceMap): Range =>
  Range.create(toVSCPosition(sourceMap.start), toVSCPosition(sourceMap.end))

export const nodeToLocation = (node: Node): Location => {
  if (!node.sourceMap || !node.sourceFileName) {
    throw new Error('No source map found for node')
  }

  return {
    uri: uriFromRelativeFilePath(node.sourceFileName!),
    range: toVSCRange(node.sourceMap),
  }
}

export function trimIn(range: Range, textDocument: TextDocument): Range {
  const start = textDocument.offsetAt(range.start)
  const end = textDocument.offsetAt(range.end)
  const text = textDocument.getText().substring(start, end)
  const trimmed = text.trim()
  const startOffset = text.indexOf(trimmed)
  const endOffset = startOffset + trimmed.length
  return Range.create(
    textDocument.positionAt(start + startOffset),
    textDocument.positionAt(start + endOffset),
  )
}

export const packageFromURI = (uri: string, environment: Environment): Package | undefined => {
  const sanitizedURI = relativeFilePath(uri)
  // TODO: Use projectFQN ?
  return environment.descendants.find(node => node.is(Package) && node.fileName === sanitizedURI) as Package | undefined
}

export const packageToURI = (pkg: Package): string => fileNameToURI(pkg.fileName!)

export const fileNameToURI = (fileName: string): string => `file:///${fileName}`

export const getWollokFileExtension = (uri: string): typeof WOLLOK_FILE_EXTENSION | typeof PROGRAM_FILE_EXTENSION | typeof TEST_FILE_EXTENSION => {
  const extension = uri.split('.').pop()
  if (!extension) throw new Error('Could not determine file extension')

  switch(extension) {
    case WOLLOK_FILE_EXTENSION:
    case PROGRAM_FILE_EXTENSION:
    case TEST_FILE_EXTENSION:
      return extension
    default:
      throw new Error(`Invalid file extension: ${extension}`)
  }
}

export function cursorNode(
  environment: Environment,
  position: Position,
  textDocument: TextDocumentIdentifier
): Node {
  return getNodesByPosition(environment, {
    position,
    textDocument,
  }).reverse()[0]
}

/** URI */

export let WORKSPACE_URI = ''

export const setWorkspaceUri = (uri: string): void => {
  WORKSPACE_URI = uri
}

export const relativeFilePath = (absoluteURI: string): string => {
  return absoluteURI.replaceAll(WORKSPACE_URI + '/', '')
}

export const uriFromRelativeFilePath = (relativeURI: string): string => {
  return WORKSPACE_URI + '/' + relativeURI
}

export const documentToFile = (doc: TextDocument): FileContent => ({
  name: relativeFilePath(doc.uri),
  content: doc.getText(),
})

export const isNodeURI = (node: Node, uri: string): boolean => node.sourceFileName == relativeFilePath(uri)

export const findPackageJSON = (uri: string): string => {
  let baseUri = uri
  while (!fs.existsSync(baseUri + path.sep + 'package.json') && baseUri) {
    const lastIndex = baseUri.lastIndexOf(path.sep)
    if (!lastIndex) return ''
    baseUri = baseUri.slice(0, lastIndex)
  }
  return baseUri
}
