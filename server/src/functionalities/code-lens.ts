import { CodeLens, CodeLensParams, Position, Range } from 'vscode-languageserver'
import { Describe, Node, Package, Test, Program, Environment } from 'wollok-ts'
import { is } from 'wollok-ts/dist/extensions'
import { getWollokFileExtension, packageFromURI, toVSCRange } from '../utils/text-documents'
import { fqnRelativeToPackage } from '../utils/vm/wollok'


export const codeLenses = (environment: Environment) => (params: CodeLensParams): CodeLens[] | null => {
  const fileExtension = getWollokFileExtension(params.textDocument.uri)
  const file = packageFromURI(params.textDocument.uri, environment)
  if (!file) return null

  switch (fileExtension) {
    case 'wpgm':
      return getProgramCodeLenses(file)
    case 'wtest':
      return getTestCodeLenses(file)
    default:
      return null
  }
}

export const getProgramCodeLenses = (file: Package): CodeLens[] =>
  file.members.filter(is(Program)).map(program => ({
    range: toVSCRange(program.sourceMap!),
    command: {
      command: 'wollok.run.program',
      title: 'Run program',
      arguments: [fqnRelativeToPackage(file, program)],
    },
  }))


export const getTestCodeLenses = (file: Package): CodeLens[] => {
  const runAllTests = buildTestCodeLens(
    Range.create(Position.create(0, 0), Position.create(0, 0)),
    file.name,
    'Run all tests'
  )

  return [
    runAllTests
    ,
    ...file
      .descendants
      .filter(isTesteable)
      .map(n =>
        buildTestCodeLens(
          toVSCRange(n.sourceMap!),
          fqnRelativeToPackage(file, n as Test | Describe),
          `Run ${n.is(Test) ? 'test' : 'describe'}`
        )
      ),
  ]
}

function buildTestCodeLens(range: Range, filter: string, title: string): CodeLens{
  return {
    range,
    command: {
      command: 'wollok.run.tests',
      title: title,
      arguments: [filter],
    },
  }
}

function isTesteable(node: Node): node is Test | Describe {
  return node.is(Test) || node.is(Describe)
}