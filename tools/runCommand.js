'use strict';
const TerminalService = require('../services/TerminalService');
const terminalService = new TerminalService();
async function runCommandTool(command, options = {}) {
    // Basic validation
    if (!command || typeof command !== 'string') {
        return {
            success: false,
            error: 'Invalid command.'
        };
    }

    const result = await terminalService.run(command, options);
    return result;
}

module.exports = {
    runCommandTool
};