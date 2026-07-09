'use strict';
const vscode = require('vscode');
const fs = require('fs');
const AgentService = require('../services/agentService');
const ChatHistoryService = require('../services/chatHistoryService');

class ChatViewProvider {
    
  constructor(context, extensionUri, outputChannel) {
        console.log('[ZIA] ChatViewProvider Constructor Called');
        this.extensionUri = extensionUri; //Used for loading resources.
        this.output = outputChannel; //Used for logging.
        this.view = null; //Stores current webview
        this.agent = new AgentService({
        workspaceRoot:
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',

    onToolStatus: (msg) => {
        this._log(msg);
    },

    onFileCreated: async (fullPath) => {
        try {
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);
        } catch (err) {
            this._log(`Failed to open file: ${err.message}`, 'ERROR');
        }
    }
});
//Creates Ollama client.
        

const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

this.chatHistory = new ChatHistoryService(
    context.workspaceState,
    workspaceRoot
);  //Stores chat history.

        this.isSending = false; // Prevents multiple simultaneous requests.

        // Loads welcome message
    }

    //Initializes the chat history
  


    resolveWebviewView(webviewView) {       //VS Code calls this when the sidebar opens.
        console.log('[ZIA] resolveWebviewView called');
        this.view = webviewView;                //Stores View

        webviewView.webview.options = {
            enableScripts: true,                    // Enables Scripts
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview); //Loads HTML

        this._log('Webview resolved');

                        // Handle messages from the webview
            
webviewView.webview.onDidReceiveMessage(
    async (data) => {

        console.log(
            '[WEBVIEW RECEIVED]',
            data
        );

        switch (data.type) {

case 'webviewReady': {
    vscode.window.showInformationMessage("Webview Ready Received");

    const files = await this.getWorkspaceFiles();

    vscode.window.showInformationMessage(
        `Files: ${files.length}`
    );

    this.view.webview.postMessage({
        type: "workspaceFiles",
        files
    });

    break;
}

            case 'sendPrompt':
                await this._handleUserPrompt(
                    data.value
                );
                break;

           case 'clearChat':
    await this.chatHistory.newChat();
    this._updateWebviewState();
    break;

    case 'exportChat':
    await this.exportChat();
    break;

        case 'newChat':
    await this.chatHistory.newChat();
    this._updateWebviewState();
    break;

           case 'loadChat':
    await this.chatHistory.loadChat(data.id);
    this._updateWebviewState();
    break;

    case 'deleteChat':
    await this.chatHistory.deleteChat(data.id);
    this._updateWebviewState();
    break;

    case 'forkMessage':
    console.log("Fork message:", data.index);
    await this.chatHistory.forkMessage(data.index);
    this._updateWebviewState();
    break;

   case 'renameChat': {
console.log("Rename message received:", data);
    const chat = this.chatHistory
        .getAllChats()
        .find(c => c.id === data.id);
console.log("Chat found:", chat);
    if (!chat) {
        break;
    }

    const newTitle = await vscode.window.showInputBox({
        prompt: "Rename Chat",
        value: chat.title
    });

    if (!newTitle || !newTitle.trim()) {
        break;
    }

    await this.chatHistory.renameChat(
        data.id,
        newTitle.trim()
    );

    this._updateWebviewState();
    break;
}

case "searchChats": {

    const chats =
        await this.chatHistory.searchChats(data.query);

    this.view.webview.postMessage({

        type: "searchResults",

        chats

    });

    break;
}

    case 'log':
     this._log(
         `[Webview] ${data.value}`,
        data.level || 'INFO'
             );
            break;
        }
    }
);

webviewView.onDidDispose(() => {
    this.view = null;
});

}
    //Logging Function 
    _log(message, level = 'INFO') { // Logs messages to the extension output channel.
        const timestamp = new Date().toLocaleTimeString();
        const fullMessage = `[${timestamp}] [Provider] [${level}] ${message}`;
        this.output.appendLine(fullMessage);
        console.log(`[Zia AI] ${fullMessage}`);
    }

    
    async _handleUserPrompt(prompt) {
         console.log(
        '[USER PROMPT]',
        prompt
    );
        if (!prompt || this.isSending)
         return; //Prevent duplicate requests... Handles user prompt and gets AI response

        this.isSending = true;  //Mark busy.
await this.chatHistory.addMessage(
    'user',
    prompt
);
await this.chatHistory.updateCurrentChatTitle(prompt);

const ollamaMessages =
    this.chatHistory.getCurrentMessages();

this._updateWebviewState(); //updates the ui

try {
   let reply = '';

await this.agent.chat(
    ollamaMessages,
    (event) => {

        if (event.type === 'token') {

            this.view?.webview.postMessage({
                type: 'token',
                value: event.data
            });

            reply += event.data;
        }
    }
);
await this.chatHistory.addMessage(
    'assistant',
    reply
); //Store Response which Adds AI response to chat history.
        } catch (error) {    //Error Handling
            this._log(error.message, 'ERROR');
           await this.chatHistory.addMessage(
    'assistant',
    `Error: ${error.message}`
);
        } finally {
            this.isSending = false;  //Finish and Then refresh UI.
            this._updateWebviewState();
        }
    }

    _updateWebviewState() {  //Sends data to frontend...Sends the current state to the webview.
        if (!this.view) return; 

        this.view.webview.postMessage({
            type: 'state',
            state: {
    messages: this.chatHistory.getCurrentMessages(),
    chats: this.chatHistory.getAllChats(),
    currentChatId: this.chatHistory.getCurrentChatId(),
    isSending: this.isSending
}
        });
    }

async exportChat() {
    const chat = this.chatHistory.getCurrentChat();

    if (!chat) {
        vscode.window.showErrorMessage(
            "No chat available to export."
        );
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${chat.title}.json`),
        filters: {
            JSON: ["json"]
        },
        saveLabel: "Export Chat"
    });

    if (!uri) {
        return;
    }

    try {
        fs.writeFileSync(
            uri.fsPath,
            JSON.stringify(chat, null, 2),
            "utf8"
        );

        vscode.window.showInformationMessage(
            "Chat exported successfully."
        );
    } catch (err) {
        vscode.window.showErrorMessage(
            `Export failed: ${err.message}`
        );
    }
}

async getWorkspaceFiles() {
    const files = await vscode.workspace.findFiles(
        "**/*",
        "**/{node_modules,.git,out,dist,build}/**"
    );

    return files.map(file => ({
        name: vscode.workspace.asRelativePath(file),
        path: file.fsPath
    }));
}

    
    _getHtmlForWebview(webview) {  //Generates the complete chat UI...Generates the HTML for the webview.
        const nonce = getNonce();
            const markedUri = webview.asWebviewUri(
        vscode.Uri.joinPath(
            this.extensionUri,
            'node_modules',
            'marked',
            'lib',
            'marked.umd.js'
        )
    );
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${webview.cspSource} 'unsafe-inline';
               script-src ${webview.cspSource} 'nonce-${nonce}';">
    <style>
        :root {
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --input-border: var(--vscode-input-border);
            --btn-bg: var(--vscode-button-background);
            --btn-hover: var(--vscode-button-hoverBackground);
            --panel-bg: var(--vscode-sideBar-background);
            --border-color: var(--vscode-panel-border);
            --user-msg-bg: var(--vscode-button-secondaryBackground);
            --user-msg-fg: var(--vscode-button-secondaryForeground);
            --ai-msg-bg: var(--vscode-editor-background);
            --ai-msg-fg: var(--vscode-editor-foreground);
        }
            html,
body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
}
body {
    background-color: var(--panel-bg);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    margin:0;
    padding:0;
    overflow:hidden;
}
#layout{
    display:flex;
    height:100vh;
    overflow:hidden;
}
#layout{
    height:100vh;
    position:relative;
}

#main{
    display:flex;
    flex-direction:column;
    height:100%;
}

#chat-header{

    display:flex;

    justify-content:space-between;

    align-items:center;

    padding:10px 14px;

    border-bottom:1px solid var(--border-color);

}

.header-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
}

#menu-btn,
#export-btn {

    width: 40px;
    height: 40px;

    display: flex;
    align-items: center;
    justify-content: center;

    border: none;
    border-radius: 8px;

    background: transparent;
    color: var(--vscode-foreground);

    cursor: pointer;

    font-size: 20px;
    font-weight: 600;

    transition: background 0.2s ease;

}

#menu-btn:hover,
#export-btn:hover {
    background: var(--btn-hover);
}
    
#chat-menu{
    position:absolute;
    top:44px;
    right:10px;

    width:280px;

    background:var(--panel-bg);
    border:1px solid var(--border-color);
    border-radius:8px;
    box-shadow:0 8px 20px rgb(0, 0, 0);

    display:none;
    overflow:hidden;
}

#chat-menu.show{

    display:block;

}

#new-chat-btn{

    width:100%;

    padding:10px;

    border:none;

    text-align:left;

}

.menu-title{

    padding:10px;

    font-size:11px;

    opacity:.6;

}
.search-container {
    padding: 10px;
    border-bottom: 1px solid var(--border-color);
    background: var(--panel-bg);
}

#chat-search {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--input-fg);
    font-size: 13px;
    outline: none;
}

#chat-search::placeholder {
    color: var(--vscode-input-placeholderForeground);
}

#chat-search:focus {
    border-color: var(--vscode-focusBorder);
}

#chat-history{

    max-height:300px;

    overflow-y:auto;

}

.history-item{

display:flex;

justify-content:space-between;

align-items:center;

padding:8px 12px;

cursor:pointer;

}

.history-row{
    display:flex;
    justify-content:space-between;
    align-items:center;
    width:100%;
}

.chat-title{
    flex:1;
    overflow:hidden;
    white-space:nowrap;
    text-overflow:ellipsis;
}

.rename-chat,
.delete-chat{

    margin-left:8px;

    background:transparent;

    border:none;

    cursor:pointer;

    color:var(--vscode-foreground);

    opacity:0;

    transition:opacity .2s;

}

.history-item:hover .rename-chat,
.history-item:hover .delete-chat{

    opacity:1;

}
.history-item:hover .delete-chat{
    opacity:1;
}
  .history-actions{
    display:flex;
    gap:6px;
    z-index:999;
}

.rename-chat,
.delete-chat{
    pointer-events:auto;
}
#main{
    flex:1;
    display:flex;
    flex-direction:column;
     min-width:0;
}

        #chat-container {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            scroll-behavior: smooth;
        }

        .message {
            display: flex;
            flex-direction: column;
            max-width: 90%;
            padding: 12px 16px;
            border-radius: 12px;
            line-height: 1.6;
            animation: fadeIn 0.3s ease-out;
            word-wrap: break-word;
        }
.fork-message-btn{

    margin-top:8px;

    align-self:flex-end;

    padding:4px 10px;

    border:none;

    border-radius:6px;

    cursor:pointer;

    font-size:12px;

    background:var(--vscode-button-secondaryBackground);

    color:var(--vscode-button-secondaryForeground);

}

.fork-message-btn:hover{

    background:var(--vscode-button-secondaryHoverBackground);

}
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .message.user {
            align-self: flex-end;
            background-color: var(--user-msg-bg);
            color: var(--user-msg-fg);
            border-bottom-right-radius: 2px;
        }

        .message.assistant {
            align-self: flex-start;
            background-color: var(--ai-msg-bg);
            color: var(--ai-msg-fg);
            border: 1px solid var(--border-color);
            border-bottom-left-radius: 2px;
            box-shadow: 0 2px 8px rgb(238, 22, 22);
        }   

        .role-label {
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 6px;
            opacity: 0.6;
            letter-spacing: 0.5px;
        }

        .content pre {
            background: rgb(255, 0, 0);
            padding: 12px;
            border-radius: 6px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            margin: 8px 0;
        }

       .content code {
    font-family: var(--vscode-editor-font-family);
    background: rgb(187, 187, 187);
    color: #000000;          /* Change this to any color you want */
    padding: 2px 4px;
    border-radius: 3px;
}
            .content h1,
.content h2,
.content h3,
.content h4,
.content h5,
.content h6 {
    margin-top: 12px;
    margin-bottom: 8px;
}

.content p {
    margin: 8px 0;
}

.content ul,
.content ol {
    padding-left: 24px;
}

.content blockquote {
    border-left: 4px solid var(--vscode-textLink-foreground);
    padding-left: 12px;
    margin: 8px 0;
}

.content table {
    border-collapse: collapse;
    width: 100%;
}

.content th,
.content td {
    border: 1px solid var(--border-color);
    padding: 6px;
}
        /* Input area styling */
        #input-panel {
            padding: 16px;
            border-top: 1px solid var(--border-color);
            background: var(--panel-bg);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .textarea-wrapper {
            position: relative;
            background: var(--input-bg);
            border: 1px solid var(--input-border);
            border-radius: 8px;
            transition: border-color 0.2s;
        }
#mention-popup{

    position:absolute;
    left:8px;
    bottom:55px;
    width:300px;
    max-height:220px;
    overflow-y:auto;
    display:none;
    background:var(--panel-bg);
    border:1px solid var(--border-color);
    border-radius:8px;
    box-shadow:0 6px 18px rgba(0,0,0,.4);
    z-index:9999;

}

.mention-item{
    padding:8px 12px;
    cursor:pointer;
}

.mention-item:hover{
    background:var(--btn-hover);

}

.mention-item.active{
    background:var(--btn-bg);
}
        .textarea-wrapper:focus-within {
            border-color: var(--vscode-focusBorder);
        }
        textarea {
            width: 100%;
            min-height: 44px;
            max-height: 200px;
            background: transparent;
            color: var(--input-fg);
            border: none;
            padding: 12px;
            resize: none;
            font-family: inherit;
            font-size: inherit;
            outline: none;
            display: block;
        }

        .controls {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #status-indicator {
            font-size: 0.75rem;
            opacity: 0.7;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .button-group {
            display: flex;
            gap: 8px;
        }

        button {
            background: var(--btn-bg);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            transition: opacity 0.2s;
        }

        button:hover { background: var(--btn-hover); }
        button:disabled { opacity: 0.4; cursor: not-allowed; }

        #clear-btn {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--vscode-foreground);
        }

        #clear-btn:hover { background: rgba(255,255,255,0.05); }
        /* Spinner for thinking state */
        .spinner {
            width: 12px;
            height: 12px;
            border: 2px solid rgb(255, 0, 0);
            border-radius: 50%;
            border-top-color: var(--vscode-foreground);
            animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
    </style>
</head>
<body>

<div id="layout">
    <div id="main">
        <div id="chat-header">
        <span>CHAT</span>
      <div class="header-buttons">
    <button id="export-btn" title="Export Chat">
        ⤓
    </button>
    <button id="menu-btn" title="Menu">
        +
    </button>
</div>
        </div>
   <div id="chat-menu" class="hidden">
    <div class="menu-item" id="new-chat-btn">
        + New Chat
    </div>
    <hr>
<div class="search-container">
    <input
        type="text"
        id="chat-search"
        placeholder="Search chats..."
    />
</div>
    <div id="chat-history"></div>
</div>
        <div id="chat-container"></div>
        <div id="input-panel">
<div class="textarea-wrapper">

    <textarea
        id="prompt-input"
        placeholder="Ask Zia AI anything..."
        rows="1">
    </textarea>

    <div id="mention-popup"></div>

</div>
            <div class="controls">
                <div id="status-indicator"></div>
 <div class="button-group">
    <button id="clear-btn">
        Clear
    </button>
    <button id="send-btn">
        Send
    </button>
</div>

            </div>
        </div>
    </div>
</div>
    <script src="${markedUri}"></script>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi(); 
        const container = document.getElementById('chat-container');
        const input = document.getElementById('prompt-input');
        const sendBtn = document.getElementById('send-btn');
        const clearBtn = document.getElementById('clear-btn');
        const exportBtn = document.getElementById('export-btn');
        const statusEl = document.getElementById('status-indicator');
        const historyContainer = document.getElementById('chat-history');
        const newChatBtn = document.getElementById('new-chat-btn');
       
        const menuBtn = document.getElementById('menu-btn');
        const chatMenu = document.getElementById('chat-menu');
        const chatSearch = document.getElementById('chat-search');
    let workspaceFiles = [];
    let filteredFiles = [];
    let selectedMention = 0;
const mentionPopup =
    document.getElementById("mention-popup");
menuBtn.onclick = () => { 
    chatMenu.classList.toggle('show'); 
};

        // Initial state from VS Code
   let currentState = vscode.getState() || {
    messages: [],
    chats: [],
    currentChatId: null,
    isSending: false
};
        // Handshake: tell extension we are ready
    
function render(state) {
    currentState = state;
    vscode.setState(state);

    if (state.chats) {
        renderHistory(state);
    }
   
            // Update status
            if (state.isSending) {
                statusEl.innerHTML = '<div class="spinner"></div> <span> Zia AI is thinking...</span>';
            } else {
                statusEl.innerHTML = '<span>Ready</span>';
            }

            // Render messages
// Render messages

let html = "";

state.messages.forEach((m, index) => {

    html += '<div class="message ' + m.role + '">';
    html += '<div class="role-label">' + m.role + '</div>';
    html += '<div class="content">';
    html += formatText(m.content);
    html += '</div>';

    // Show Fork only for assistant messages
    if (m.role === "assistant") {
        html +=
            '<button class="fork-message-btn" data-index="' +
            index +
            '">Fork</button>';

    }
    html += '</div>';
});

container.innerHTML = html;
// Attach click listeners
document.querySelectorAll(".fork-message-btn").forEach(btn => {
    btn.onclick = () => {
        vscode.postMessage({
            type: "forkMessage",
            index: Number(btn.dataset.index)
        });
    };
});
container.scrollTop = container.scrollHeight;
input.disabled = state.isSending;
sendBtn.disabled = state.isSending || !input.value.trim();
        }
        function formatText(text) {
    if (!text) return '';
    return marked.parse(text, {
        gfm: true,
        breaks: true
    });
}
function renderMentionPopup() {
    mentionPopup.innerHTML = "";
    if (filteredFiles.length === 0) {
        mentionPopup.style.display = "none";
        return;
    }
    mentionPopup.style.display = "block";
    filteredFiles.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "mention-item";
        if (index === selectedMention) {
            item.classList.add("active");
        }
        item.textContent = file.name;
        item.onclick = () => {
            input.value =
                input.value.replace(
                    /@([^\s]*)$/,
                    "@" + file.name + " "
                );

            mentionPopup.style.display = "none";

            input.focus();

        };
        mentionPopup.appendChild(item);
    });
}

       function handleSend() {
    console.log('SEND CLICKED');
    const value = input.value.trim();
    if (value && !currentState.isSending) {
         streamingContent = '';
        console.log('MESSAGE:', value);

        vscode.postMessage({
            type: 'sendPrompt',
            value
        });

        input.value = '';
        input.style.height = 'auto';
    }
}
// Chat History Renderer
function renderHistory(state) {

    historyContainer.innerHTML = '';

    if (!state.chats) return;

    state.chats.forEach(chat => {

        const item = document.createElement('div');
        item.className = 'history-item';

        if (chat.id === state.currentChatId) {
            item.classList.add('active');
        }

        const title = document.createElement('span');
        title.className = 'chat-title';
        title.textContent = chat.title;

        // Rename button
        const rename = document.createElement('button');
        rename.className = 'rename-chat';
        rename.textContent = "✎";

       rename.onclick = (e) => {
        e.stopPropagation();
        console.log("Rename button clicked");
        vscode.postMessage({
            type: "renameChat",
            id: chat.id
        });

    chatMenu.classList.remove("show");
};

        // Delete button
        const del = document.createElement('button');
        del.className = 'delete-chat';
        del.textContent = "🗑";

        del.onclick = (e) => {
            e.stopPropagation();
            vscode.postMessage({
                type: "deleteChat",
                id: chat.id
            });
            chatMenu.classList.remove("show");
        };
        // Load chat
        item.onclick = () => {
            vscode.postMessage({
                type: "loadChat",
                id: chat.id
            });

            chatMenu.classList.remove("show");
        };

        const wrapper = document.createElement('div');
        wrapper.className = 'history-row';

        const actions = document.createElement('div');
        actions.className = 'history-actions';

        actions.onclick = (e) => {
            e.stopPropagation();
        };

        actions.appendChild(rename);
        actions.appendChild(del);

        wrapper.appendChild(title);
        wrapper.appendChild(actions);

        item.appendChild(wrapper);
        historyContainer.appendChild(item);

    });

}
        // Event Listeners
    input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height =
    Math.min(input.scrollHeight, 200) + "px";

    sendBtn.disabled =
        currentState.isSending ||
        !input.value.trim();

    const text = input.value;
    const match = text.match(/@([^\s]*)$/);

    if (!match) {
        mentionPopup.style.display = "none";
        return;
    }

    const query = match[1].toLowerCase();
    filteredFiles = workspaceFiles.filter(file =>
        file.name.toLowerCase().includes(query)
    );

    selectedMention = 0;
    renderMentionPopup();

});

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

sendBtn.addEventListener('click', handleSend);
exportBtn.addEventListener('click', () => {
    vscode.postMessage({
        type: 'exportChat'
    });
});

clearBtn.addEventListener('click', () =>
    vscode.postMessage({ type: 'clearChat' }));

newChatBtn.addEventListener('click', () => {
    vscode.postMessage({
        type: 'newChat'
    });

    chatMenu.classList.remove('show');
});

chatSearch.addEventListener("input", () => {
console.log(chatSearch.value);
    vscode.postMessage({
        type: "searchChats",
        query: chatSearch.value
    });
});

     let streamingContent = '';
     window.addEventListener('message', (event) => {

    const message = event.data;
if (message.type === "workspaceFiles") {

    workspaceFiles = message.files;

    console.log(
        "[Webview] Workspace Files Received:",
        workspaceFiles.length
    );

    console.log(workspaceFiles);

    return;
}
    if (message.type === 'state') {

        const old = document.getElementById('streaming-response');

        if (old) {
            old.remove();
        }

        render(message.state);
        return;
    }
if (message.type === "searchResults") {

    renderHistory({

        chats: message.chats,

        currentChatId: currentState.currentChatId

    });

    return;
}
    if (message.type === 'token') {

        streamingContent += message.value;

        let streamingDiv = document.getElementById('streaming-response');

if (!streamingDiv) {
    streamingDiv = document.createElement('div');
    streamingDiv.id = 'streaming-response';
    streamingDiv.className = 'message assistant';
    container.appendChild(streamingDiv);
}
streamingDiv.innerHTML = \`
    <div class="role-label">assistant</div>
    <div class="content">
        \${formatText(streamingContent)}
    </div>
\`;

container.scrollTop = container.scrollHeight;
    }
});

// Tell the extension we're ready
vscode.postMessage({
    type: "webviewReady"
});

input.focus();
    </script>
</body>
</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';  // Generates a random nonce for CSP.
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

module.exports = ChatViewProvider;