const { Ollama } = require('ollama');
const { readFilesTool } = require('../tools/readFiles');
const { fileTreeTool } = require('../tools/fileTree');
const { semanticSearchTool } = require('../tools/semanticSearch');
const { runCommandTool } = require('../tools/runCommand');
const { writeFileTool } = require('../tools/writeFile');
const { searchReplaceTool } = require('../tools/searchAndReplace');
const RagService = require('../RaG/ragService');

class AgentService {
    constructor(options = {}) {
        this.baseUrl = String(options.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '');
        this.model = options.model || 'qwen3.5:latest';        
        this.temperature = Number(options.temperature ?? 0.2);
        this.client = new Ollama({ host: this.baseUrl });
        this.workspaceRoot = options.workspaceRoot || '';
        this.onToolStatus = options.onToolStatus || (() => {});
        this.onFileCreated = options.onFileCreated || (() => {});
        this.ragService = new RagService(
             this.workspaceRoot,
             this.client
);
    }
    getTools() {
        return [
            {
                type: 'function',
                function: {
                    name: 'read_files', 
                    description: 'Read one or multiple files from the workspace',
                    parameters: {
                        type: 'object',
                        properties: {
                            paths: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'List of file paths to read, relative to workspace root'
                            }
                        },
                        required: ['paths']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'file_tree',
                    description: 'Get the project file tree structure',
                    parameters: {
                        type: 'object',
                        properties: {}
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'semantic_search',
                    description: 'Search codebase for relevant code using natural language',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Search query to find relevant code'
                            }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'run_command',
                    description: 'Execute terminal commands',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: {
                                type: 'string',
                                description: 'The terminal command to execute'
                            }
                        }, 
                        required: ['command']
                    }
                }
             },
              {
        type: 'function',
       function: {
            name: 'write_file',
            description: 'Write or update a file in the workspace',
            parameters: {
                type: 'object',
                properties: {
                    relativePath: {
                        type: 'string',
                        description: 'Path of the file relative to workspace root'
                    },
                    content: {
                        type: 'string',
                        description: 'Content to write into the file'
                    }
                },
                required: ['relativePath', 'content']
           }
       } 
   }, {
    type: 'function',
    function: {
        name: 'search_replace',
        description: "Replace text across workspace files. MUST be used for replace, rename, update text, refactor, and search-and-replace requests.",
        parameters: {
            type: 'object',
            properties: {
                searchText: {
                    type: 'string',
                    description: 'Text to search for'
                },
                replaceText: {
                    type: 'string',
                    description: 'Text to replace with'
                }
            },
            required: [
                'searchText',
                'replaceText'
            ]
        }
    }
}
];
    } 
    async executeToolCall(toolName, args) {
        console.log(`[Agent] Executing tool: ${toolName}`, args);

        try {
            if (toolName === 'read_files') {
                if (!Array.isArray(args.paths)) {
                    return { error: 'paths must be an array' };
                }
                return readFilesTool(args.paths, this.workspaceRoot);
            }

            if (toolName === 'file_tree') {
                return fileTreeTool(this.workspaceRoot);
            }

            if (toolName === 'semantic_search') {
                if (!args.query) {
                    return { error: 'query is required' };
                }
                return await semanticSearchTool(args.query, this.workspaceRoot);
            }

            if (toolName === 'run_command') {
                if (!args.command) {
                    return { error: 'command is required' };
                }
                return await runCommandTool(args.command,{
                    cwd: this.workspaceRoot
                });
            } 
            if (toolName === 'write_file') {
    if (!args.relativePath) {
        return { error: 'relativePath is required' };
    }

    if (typeof args.content !== 'string') {
        return { error: 'content is required' };
    }

  const result = await writeFileTool(
    this.workspaceRoot,
    args.relativePath,
    args.content
);

if (result.success && result.fullPath) {
    console.log('[OPEN FILE]', result.fullPath);

    await this.onFileCreated(result.fullPath);
}

return result;
}
if (toolName === 'search_replace') {
    if (!args.searchText) {
        return {
            error: 'searchText is required'
        };
    }

    if (typeof args.replaceText !== 'string') {
        return {
            error: 'replaceText is required'
        };
    }

   console.log(
    '[SEARCH_REPLACE EXECUTING]'
);

console.log(
    '[SEARCH]',
    args.searchText
);

console.log(
    '[REPLACE]',
    args.replaceText
);

const result =
    await searchReplaceTool(
        this.workspaceRoot,
        args.searchText,
        args.replaceText
    );

console.log(
    '[SEARCH_REPLACE RESULT]',
    JSON.stringify(
        result,
        null,
        2
    )
);

return result;
}
            return { error: `Unknown tool: ${toolName}` };
        } catch (error) {
            console.error(`[Agent] Tool error:`, error);
            return { error: String(error.message || error) };
        }
    }
   async chat(messages, userCallback) {
    const systemPrompt = `You are Zia AI, an advanced AI coding assistant for VS Code.

You have access to powerful tools:
- read_files: Read source files
- file_tree: View project structure
- semantic_search: Search codebase semantically
- run_command: Execute terminal commands
- write_file: Create or update files in the workspace
- search_replace: Find and replace text across workspace files

TOOL USAGE RULES:
1. Use tools before answering when necessary.
2. When asked about code, read the relevant files first.
3. Use file_tree to understand project structure.
4. Use semantic_search to locate relevant code.
5. Be concise.
6. Explain which tools are being used.
7. If the user asks to create, write, generate, save, add, update, or modify a file,
   you MUST call the write_file tool.
8. NEVER provide shell commands such as:
   touch
   mkdir
   echo
   cat
   node
   javac
   java

9. NEVER tell the user to manually create a file.
10. NEVER output source code directly when the user asks to create a file.
11. File creation MUST be performed through write_file.
12. After a successful write_file call, tell the user the file path returned by the tool.
13. If the user provides a filename but no content, generate reasonable content and call write_file.
14. Tool usage takes priority over normal text responses.
15. If the user asks to replace, rename, refactor, update text, modify existing code, or perform search and replace operations, you MUST call the search_replace tool.
16. NEVER use semantic_search for replacement tasks.`;

const lastUserMessage =
    messages[messages.length - 1]
        ?.content || '';
let ragContext = '';

try {
ragContext =
    await this.ragService.buildContext(
        lastUserMessage
    );

console.log("========== RAG CONTEXT ==========");
console.log(ragContext);
console.log("Context Length:", ragContext.length);
console.log("=================================");
} catch (err) {

    console.error(
        '[RAG ERROR]',
        err
    );

}
const recentMessages =
    messages.slice(-10);
console.log("========== SYSTEM PROMPT ==========");
console.log(systemPrompt);
console.log("===================================");
    const allMessages = [
    {
        role: 'system',
        content: `${systemPrompt}

=========================
PROJECT CONTEXT
=========================

${ragContext}

=========================`
    },

    ...recentMessages
];

const replaceMatch =
    lastUserMessage.match(/(replace|rename|change|update)\s+(.+?)\s+(with|to)\s+(.+)/i);
if (replaceMatch) {
    const searchText = replaceMatch[2].trim();
    const replaceText = replaceMatch[4].trim();

    console.log('[FORCED SEARCH_REPLACE]');
    console.log('[SEARCH]',searchText);
    console.log('[REPLACE]',replaceText);
    const result = await searchReplaceTool(this.workspaceRoot, searchText,replaceText);

    return JSON.stringify(result,null,2);
}
    let iterationCount = 0;
    const maxIterations = 5;

    while (iterationCount < maxIterations) {
        iterationCount++;

        console.log(`[Agent] Iteration ${iterationCount}`);
        console.log(
    '[TOOLS]',
    JSON.stringify(this.getTools(), null, 2)
);
        try {
console.log("========== MESSAGES SENT TO OLLAMA ==========");
console.log(JSON.stringify(allMessages, null, 2));
console.log("=============================================");

const stream = await this.client.chat({
    model: this.model,
    messages: allMessages,
    tools: this.getTools(),
    stream: true,
    options: {
        temperature: this.temperature,
        num_predict: 2048
    }
});
let content = '';
let thinking = '';
/** @type {any[]} */
let toolCalls = [];

for await (const chunk of stream) {

    if (chunk.message?.thinking) {
        thinking += chunk.message.thinking;
    }

    if (chunk.message?.content) {

        content += chunk.message.content;

        if (userCallback) {
            userCallback({
                type: 'token',
                data: chunk.message.content
            });
        }
    }

    if (chunk.message?.tool_calls?.length) {
    toolCalls.push(...chunk.message.tool_calls);
    }
}
console.log("========== FINAL THINKING ==========");
console.log(thinking);

console.log("========== FINAL CONTENT ==========");
console.log(content);
const response = {
    message: {
        content,
        tool_calls: toolCalls
    }
};

console.log('\n========== OLLAMA RESPONSE ==========');
console.log(JSON.stringify(response, null, 2));
console.log('====================================\n');
            console.log(
    '[FULL RESPONSE]',
    JSON.stringify(response, null, 2)
);

            console.log(
                '[Agent] Model response:',
                response.message.content
            );

       toolCalls =
    response.message?.tool_calls ?? [];
    console.log(
    '[RAW CONTENT]',
    response.message?.content
);

console.log(
    '[RAW TOOL CALLS]',
    response.message?.tool_calls
);
            console.log(
    '\n===================='
);

console.log(
    '[MODEL CONTENT]'
);

console.log(
    response.message.content
);

console.log(
    '[TOOL CALL COUNT]',
    toolCalls.length
);

console.log(
    '[TOOL CALLS]',
    JSON.stringify(
        toolCalls,
        null,
        2
    )
);

console.log(
    '====================\n'
);
            console.log(
                '[TOOL CALLS]',
                JSON.stringify(toolCalls, null, 2)
            );

if (toolCalls.length === 0) {

    if (content.trim()) {
        return content;
    }

    if (thinking.trim()) {
        return thinking;
    }

    return '';
}
            allMessages.push({
    role: 'assistant',
    content: response.message.content,
    tool_calls: toolCalls
});
            
for (const toolCall of toolCalls) {
                console.log('[TOOL CALL]', toolCall);

                const toolName =
                    toolCall.function.name;

                let args =
                    toolCall.function.arguments;

                if (typeof args === 'string') {
                    try {
                        args = JSON.parse(args);
                    } catch {
                        args = {};
                    }
                }

                const statusMsg =
                    this._getToolStatusMessage(
                        toolName,
                        args
                    );

                this.onToolStatus(statusMsg);

                console.log(
                    `[Agent] Tool status: ${statusMsg}`
                );

                if (userCallback) {
                    userCallback({
                        type: 'tool_status',
                        data: statusMsg
                    });
                }

                const toolResult =
                    await this.executeToolCall(
                        toolName,
                        args
                    );

                console.log(
                    '[Agent] Tool result:',
                    toolResult
                );



                const toolContent =
    JSON.stringify(toolResult);

allMessages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
   content: toolContent
});

            }
} catch (error) {

    console.error("========== FULL ERROR ==========");
    console.error(error);
    console.error("MESSAGE:", error.message);
    console.error("STACK:", error.stack);
    console.error("================================");

    throw error;
}
    }

    throw new Error(
        'Agent exceeded maximum iterations'
    );
}
    _getToolStatusMessage(toolName, args) {
        switch (toolName) {
            case 'read_files':
                return ` Reading: ${(args.paths || []).join(', ')}`;
            case 'file_tree':
                return ` Analyzing project structure...`;
            case 'semantic_search':
                return ` Searching: "${args.query || ''}"`;
            case 'run_command':
                return `Running: ${args.command || ''}`;
            case 'search_replace':
    return `Replacing "${args.searchText}" with "${args.replaceText}"`;
            default:
                return ` Using tool: ${toolName}`;
        }
    }
}
module.exports = AgentService;
