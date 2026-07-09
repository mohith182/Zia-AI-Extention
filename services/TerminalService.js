'use strict';
const vscode = require('vscode');
const { spawn } = require('child_process');
class TerminalService {
    constructor() {
        this.terminal = null;
    }
    getTerminal() {
        if (!this.terminal) {
            this.terminal = vscode.window.createTerminal("Zia AI");
        }
        return this.terminal;
    }

    async run(command, options = {}) {

        const cwd =
            options.cwd ||
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
            process.cwd();

        const timeout = options.timeout || 50000;
        const onData = options.onData;

        // Show command in VS Code terminal
        const terminal = this.getTerminal();
                 terminal.show(true);
                 terminal.sendText(command);
        return new Promise((resolve) => {
            const startTime = Date.now();
            const child = spawn(command, {
                cwd,
                shell: true
            });
            let stdout = "";
            let stderr = "";

            // stdout
            child.stdout.on("data", (data) => {
                const text = data.toString();
                stdout += text;
                if (onData) {
                    onData("stdout", text);
                }
            });

            // stderr
            child.stderr.on("data", (data) => {
                const text = data.toString();
                stderr += text;
                if (onData) {
                    onData("stderr", text);
                }
            });

            // spawn error
            child.on("error", (error) => {
                resolve({
                    success: false,
                    command,
                    stdout,
                    stderr: error.message,
                    exitCode: -1,
                    duration: Date.now() - startTime
                });
            });

            // timeout
            const timer = setTimeout(() => {
                child.kill();
                resolve({
                    success: false,
                    command,
                    stdout,
                    stderr: "Process timed out.",
                    exitCode: -1,
                    duration: Date.now() - startTime

                });
            }, timeout);

            // process finished
            child.on("close", (code) => {
                clearTimeout(timer);
                resolve({
                    success: code === 0,
                    command,
                    stdout,
                    stderr,
                    exitCode: code,
                    duration: Date.now() - startTime
                });
            });
        });
    }

    // when the extension deactivates, dispose of the terminal to free resources.
    dispose() {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }
    }
}

module.exports = TerminalService;