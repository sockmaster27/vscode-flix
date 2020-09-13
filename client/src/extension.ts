import * as path from 'path'
import * as vscode from 'vscode'

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient'

const _ = require('lodash/fp')

let client: LanguageClient

let flixWatcher: vscode.FileSystemWatcher

const EXTENSION_PATH = vscode.extensions.getExtension('flix.flix').extensionPath
const FLIX_GLOB_PATTERN = '**/*.flix'

/**
 * Convert filename to VSCode compatible URI
 * This is the same encoding used by TextDocument URIs.
 * 
 * @param path {string} - Path or filename
 */
function pathToURI (path) {
  return vscode.Uri.file(path).toString(false)
}

export async function activate(context: vscode.ExtensionContext) {
  // The server is implemented in node
  let serverModule = context.asAbsolutePath(path.join('server', 'out', 'server.js'))
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] }

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  let serverOptions: ServerOptions = {
    run: { 
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  }

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for flix documents
    documentSelector: [{ scheme: 'file', language: 'flix' }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
    }
  }

  // Create the language client and start the client.
  client = new LanguageClient(
    'flixLanguageServer',
    'Flix Language Server',
    serverOptions,
    clientOptions
  )

  // Start the client. This will also launch the server
  client.start()

  // Wait for client and server to be ready before registering listeners
  await client.onReady()

  // watch for changes on the file system (delete, create, rename .flix files)
  flixWatcher = vscode.workspace.createFileSystemWatcher(FLIX_GLOB_PATTERN)
  flixWatcher.onDidDelete(({ path }) => {
    const uri = pathToURI(path)
    client.sendNotification('remUri', { uri })
  })
  flixWatcher.onDidCreate(({ path }) => {
    const uri = pathToURI(path)
    client.sendNotification('addUri', { uri })
  })

  const workspaceFiles: [string] = _.map(pathToURI, (await vscode.workspace.findFiles(FLIX_GLOB_PATTERN)))
  client.sendNotification('ready', { 
    extensionPath: EXTENSION_PATH || context.extensionPath,
    globalStoragePath: context.globalStoragePath,
    workspaceFiles
  })
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined
  }
  flixWatcher.dispose()
  return client.stop()
}
