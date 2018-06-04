import { promisify } from 'es6-promisify';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { POINT_CONVERSION_COMPRESSED } from 'constants';

const writeFileP: (filename: string, data: any) => Promise<void> = promisify(fs.writeFile);
const readFileP = promisify(fs.readFile);

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
    enabled?: boolean;
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

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('vscode-breakpoints.exportBreakpoints', exportBreakpoints));
    context.subscriptions.push(vscode.commands.registerCommand('vscode-breakpoints.importBreakpoints', importBreakpoints));
}

async function exportBreakpoints(): Promise<void> {
    const exportedBps: IExportedBreakpoints = {
        breakpoints: vscode.debug.breakpoints.map(bp => serializeBreakpoint(bp as CodeBreakpoint))
    };

    let bpFileLocation: Maybe<string>;
    const saveUri = await vscode.window.showSaveDialog({ filters: { 'JSON': ['json'] } });
    bpFileLocation = saveUri && saveUri.fsPath;

    if (bpFileLocation) {
        await writeFileP(bpFileLocation, JSON.stringify(exportedBps, undefined, '  '));
    }
}

async function importBreakpoints(): Promise<void> {
    const breakpointsFiles = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false
    });
    if (!breakpointsFiles) {
        return;
    }

    const breakpointFile = breakpointsFiles[0];
    const fileBuffer = await readFileP(breakpointFile.fsPath);

    let fileContents: IExportedBreakpoints;
    try {
        fileContents = JSON.parse(fileBuffer.toString());
    } catch (e) {
        const fileName = path.basename(breakpointFile.fsPath);
        throw new Error(`Invalid JSON in ${fileName}: ${e.message}`);
    }

    const codeBps = fileContents.breakpoints.map(deserializeBreakpoint);
    vscode.debug.addBreakpoints(codeBps);
}

function serializeBreakpoint(bp: CodeBreakpoint): SerializedBreakpoint {
    return {
        enabled: bp.enabled ? undefined : bp.enabled,
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

function deserializeBreakpoint(serializedBp: SerializedBreakpoint): CodeBreakpoint {
    return serializedBp.path ?
        new vscode.SourceBreakpoint(
            new vscode.Location(vscode.Uri.file(serializedBp.path), new vscode.Position(serializedBp.position!.line, serializedBp.position!.character)),
            serializedBp.enabled,
            serializedBp.condition,
            serializedBp.hitCondition,
            serializedBp.logMessage) :
        new vscode.FunctionBreakpoint(
            serializedBp.functionName!,
            serializedBp.enabled,
            serializedBp.condition,
            serializedBp.hitCondition,
            serializedBp.logMessage);
}

export function deactivate() {
}