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
    path?: string; // absolute path or ${workspaceFolder:myFolder}/foo/bar.js
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
    } else {
        console.log(JSON.stringify(exportedBps, undefined, '  '));
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
                path: serializeBreakpointPath(bp),
                position: bp.location.range.start
            } :
            {
                functionName: bp.functionName
            })
    };
}

function serializeBreakpointPath(bp: vscode.SourceBreakpoint): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(bp.location.uri);
    if (!workspaceFolder) {
        return bp.location.uri.fsPath;
    }

    return vscode.workspace.asRelativePath(bp.location.uri, true);
}

function deserializeBreakpoint(serializedBp: SerializedBreakpoint): CodeBreakpoint {
    return serializedBp.path ?
        new vscode.SourceBreakpoint(
            new vscode.Location(deserializeBreakpointPath(serializedBp.path), new vscode.Position(serializedBp.position!.line, serializedBp.position!.character)),
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

function deserializeBreakpointPath(_path: string): vscode.Uri {
    if (path.isAbsolute(_path)) {
        return vscode.Uri.file(_path);
    }

    const [folderName, ...rest] = _path.split(/[\/\\]/);
    const folder = getWorkspaceFolder(folderName);
    if (!folder) {
        // Breakpoint path is not absolute, but can't be resolved in a workspace folder
        throw new Error(`Breakpoint at ${_path} could not be resolved to a file in the current workspace`);
    }

    const relativePath = rest.join('/');
    return vscode.Uri.file(
        path.join(folder.uri.fsPath, relativePath));
}

function getWorkspaceFolder(name: string): Maybe<vscode.WorkspaceFolder> {
    if (!vscode.workspace.workspaceFolders) {
        return undefined;
    }

    for (let folder of vscode.workspace.workspaceFolders) {
        if (folder.name === name) {
            return folder;
        }
    }

    return undefined;
}

export function deactivate() {
}