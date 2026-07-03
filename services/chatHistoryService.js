'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');


const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
class ChatHistoryService {
constructor(storage, workspaceRoot) {

    this.storage = storage;
    this.workspaceRoot = workspaceRoot;

    this.chatHistoryDir = path.join(
    workspaceRoot,
    "chatHistory"
);

if (!fs.existsSync(this.chatHistoryDir)) {
    fs.mkdirSync(this.chatHistoryDir, { recursive: true });
}
this.chats = [];

if (fs.existsSync(this.chatHistoryDir)) {

    const files = fs.readdirSync(this.chatHistoryDir);

  this.chats = files
    .filter(file => file.endsWith(".json.gz"))
    .map(file => {
        const compressed = fs.readFileSync(
            path.join(this.chatHistoryDir, file)
        );

        const json = zlib
            .gunzipSync(compressed)
            .toString("utf8");

        return JSON.parse(json);
    });
}

this.currentChatId =
    this.chats.length > 0
        ? this.chats[this.chats.length - 1].id
        : null;

    if (this.chats.length === 0) {
        this.newChat();
    }
}
async save() {
        console.log("[CHAT] Saving history...");
    await this.storage.update(
        "ziaChats",
        this.chats
    );

    await this.storage.update(
        "ziaCurrentChat",
        this.currentChatId
    );

    if (this.workspaceRoot) {

for (const chat of this.chats) {
const filePath = path.join(
    this.chatHistoryDir,
    `${chat.id}.json.gz`
);

const json = JSON.stringify(chat, null, 2);

const compressed = await gzip(json);

await fs.promises.writeFile(
    filePath,
    compressed
);

}

    }

}
async newChat() {
    const chat = {
            id: Date.now().toString(),
            title: 'New Chat',
            createdAt: new Date(),
            updatedAt: new Date(),
       messages: [
    {
        role: 'assistant',
        content: 'Hello! I am Zia AI. How can I help you today?'
    }
]
        };
    this.chats.push(chat);
    this.currentChatId = chat.id;
    await this.save();
    return chat;
}

    getCurrentChat() {
        return this.chats.find(
            chat => chat.id === this.currentChatId
        );
    }
  

async loadChat(chatId) {
    const chat = this.chats.find(
        c => c.id === chatId
    );
    if (chat) {
        this.currentChatId = chatId;
        await this.save();
    }
    return chat;
}


async deleteChat(chatId) {

   const filePath = path.join(
    this.chatHistoryDir,
    `${chatId}.json.gz`
);

if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
}
    this.chats = this.chats.filter(
        chat => chat.id !== chatId
    );

    if (this.currentChatId === chatId) {
        if (this.chats.length === 0) {
            await this.newChat();
        } else {
            this.currentChatId = this.chats[0].id;
        }
    }

    await this.save();
}


   async addMessage(role, content) {
    const chat = this.getCurrentChat();
    if (!chat) return;
    chat.messages.push({
        role,
        content
    });

    chat.updatedAt = new Date();
    await this.save();
}


async updateCurrentChatTitle(prompt) {
    const chat = this.getCurrentChat();
    if (!chat) return;
    if (chat.title === 'New Chat') {
        chat.title =
            prompt.length > 30
                ? prompt.substring(0, 30) + '...'
                : prompt;
        await this.save();
    }
}


async clearCurrentChat() {
    const chat = this.getCurrentChat();
    if (!chat) return;
  chat.messages = [
    {
        role: "assistant",
        content: "Hello! I am Zia AI. How can I help you today?"
    }
];
    chat.updatedAt = new Date();
    await this.save();
}

async forkMessage(messageIndex) {

    const chat = this.getCurrentChat();

    if (!chat) {
        return null;
    }

    const forkedChat = {
        id: Date.now().toString(),
        title: `${chat.title} (Fork)`,
        createdAt: new Date(),
        updatedAt: new Date(),

        // Copy only messages up to the selected one
        messages: JSON.parse(
            JSON.stringify(
                chat.messages.slice(0, messageIndex + 1)
            )
        )
    };

    this.chats.push(forkedChat);

    this.currentChatId = forkedChat.id;

    await this.save();

    return forkedChat;
}

    getCurrentMessages() {
        const chat = this.getCurrentChat();
        return chat ? chat.messages : [];
    }



    getAllChats() {
        return this.chats;
    }



    getCurrentChatId() {
        return this.currentChatId;
    }


}
module.exports = ChatHistoryService;