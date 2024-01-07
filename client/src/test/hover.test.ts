import * as assert from 'assert'
import { commands, Hover, MarkdownString, Position, Range, Uri } from 'vscode'
import { activate, getDocumentURI } from './helper'

/** ATTENTION
 * These tests are NOT ATOMIC, they depend on each other, order matters. (Resolve TODO)
 * */
suite('Should display on hover', () => {
  const hoverURI = getDocumentURI('hover.wlk')

  test('hover field', async () => {
    await testHover(
      hoverURI,
      new Position(1, 8),
      new Hover(
        [
          new MarkdownString('Field: Number'),
          new MarkdownString('\n```wollok\nconst x = 2\n```\n'),
        ],
        new Range(new Position(1, 2), new Position(2, 0))
      )
    )
  })
})


async function testHover(uri: Uri, position: Position, expected: any): Promise<void> {
  await activate(uri)
  const actual = await commands.executeCommand('vscode.executeHoverProvider', uri, position)
  assert.deepEqual(actual, [expected])
  assert.deepEqual(
    actual[0].contents.map(content => content.value),
    expected.contents.map(content => content.value)
  )
}