import * as path from 'path';
import * as fs from 'fs';

import * as vscode from 'vscode';

import { promisify } from 'es6-promisify';
const writeFileP: (filename: string, data: any) => Promise<void> = promisify(fs.writeFile);

type Maybe<T> = T | null | undefined;

// Things I need:
// - command to export current breakpoints
// - command to import breakpoints from some file
//      - How to select the file?
//      - ** Some file at well-known location, like .vscode/breakpoints.json
//          - Multi-root workspaces?
//          - Saved as a setting?

type CodeBreakpoint = vscode.SourceBreakpoint | vscode.FunctionBreakpoint;
interface SerializedBreakpoint {
    enabled: boolean;
    condition?: string;
    hitCondition?: string;
    logMessage?: string;

    // SourceBreakpoint
    path?: string;
    position?: { line: number, character: number };

    // FunctionBreakpoint
    functionName?: string;
}

interface IExportedBreakpoints {
    breakpoints: SerializedBreakpoint[];
}

const BP_EXPORT_PATH_IN_WORKSPACE = '.vscode/breakpoints.json';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('vscode-breakpoints.exportBreakpoints', async () => {
            const exportedBps: IExportedBreakpoints = {
                breakpoints: vscode.debug.breakpoints.map(bp => serializeBreakpoint(bp as CodeBreakpoint))
            };

            // const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
            let bpFileLocation: Maybe<string>;
            // if (folder && folder.uri.scheme === 'file') {
            //     bpFileLocation = path.join(folder.uri.fsPath, BP_EXPORT_PATH_IN_WORKSPACE);
            // } else {
                const saveUri = await vscode.window.showSaveDialog({ filters: { 'JSON': ['json'] } });
                bpFileLocation = saveUri && saveUri.fsPath;
            // }

            if (bpFileLocation) {
                await writeFileP(bpFileLocation, JSON.stringify(exportedBps, undefined, '  '));
            }
        }));
}

function serializeBreakpoint(bp: CodeBreakpoint): SerializedBreakpoint {
    return {
        enabled: bp.enabled,
        condition: bp.condition,
        hitCondition: bp.hitCondition,
        logMessage: bp.logMessage,
        ...(bp instanceof vscode.SourceBreakpoint ?
            {
                path: bp.location.uri.fsPath,
                position: bp.location.range.start
            } :
            {
                functionName: bp.functionName
            })
    };
}

export function deactivate() {
}