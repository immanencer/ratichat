import { chunkText, saveMessageToDatabase } from "./utils.js";
import { Client, Events, GatewayIntentBits, WebhookClient } from "discord.js";
import { MongoClient } from "mongodb";
import { OpenAI } from "openai";
import fs from "fs";

class RatipathBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
            ],
        });

        this.token = process.env.DISCORD_BOT_TOKEN;
        this.mongoUri = process.env.MONGODB_URI;
        this.openaiApiKey = process.env.OPENAI_API_KEY;
        this.model = "gpt-4o-2024-08-06";
        this.debounceTime = 5000;
        this.lastProcessed = 0;
        this.messageCache = [];
        this.webhookCache = {};
        this.conversationHistories = {};
        this.historyLimit = 10;
        this.interactionLimit = 2; // Allowing avatars to respond to up to two bot messages
        this.lastMentionedChannels = {};
        this.channelDecayTime = 300000; // 5 minutes decay time before reverting to core channel

        this.mongoClient = new MongoClient(this.mongoUri);
        this.openai = new OpenAI();
        this.lastProcessed = new Map(); // Use a Map to track timestamps per channel/avatar

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.client.once(Events.ClientReady, this.onReady.bind(this));
        this.client.on(Events.MessageCreate, this.handleMessage.bind(this));
    }

    async onReady() {
        console.log(`🧠 Ratipath is online as ${this.client.user.tag}`);
        await this.connectToMongoDB();
        await this.loadAvatars();
        this.isInitialized = true;
        console.log("🧠 Bot initialization complete");

        setInterval(this.dailyRoutine.bind(this), 24 * 60 * 60 * 1000); // Every 24 hours
    }

    isAvatarMessage(message) {
        return this.avatars.some(
            (avatar) =>
                message.author.username ===
                `${avatar.name} ${avatar.emoji || ""}`.trim(),
        );
    }

    findMentionedAvatar(message) {
        return this.avatars.find((avatar) => {
            const nameRegex = new RegExp(`\\b${avatar.name}\\b`, "i");
            return nameRegex.test(message.content);
        });
    }

    debounce(key, callback) {
        const now = Date.now();
        const last = this.lastProcessed.get(key) || 0;
        if (now - last < this.debounceTime) return;
        this.lastProcessed.set(key, now);
        callback();
    }

    async processMessages(channel, avatar) {
        const result = await this.chatWithAI(avatar);

        if (result.trim() !== "") {
            console.log(`🧠 ${avatar.name} responds:`, result);
            this.addToConversationHistory(avatar.name, {
                role: "assistant",
                content: result,
            });

            await saveMessageToDatabase(this.db, {
                content: result,
                author: avatar.name,
                location: channel.name,
                isBot: true,
            });

            await this.sendAsAvatar(result, channel, avatar);

            if (this.shouldContinueConversation(avatar.name)) {
                await this.initiateAvatarInteraction(avatar, channel);
            }
        } else {
            console.error(`🧠 ${avatar.name} has no response`);
        }
    }

    addToConversationHistory(avatarName, message) {
        if (!this.conversationHistories[avatarName]) {
            this.conversationHistories[avatarName] = [];
        }

        this.conversationHistories[avatarName].push(message);

        if (this.conversationHistories[avatarName].length > this.historyLimit) {
            this.conversationHistories[avatarName].shift();
        }
    }

    shouldContinueConversation(avatarName) {
        const recentHistory = this.conversationHistories[avatarName].slice(
            -this.interactionLimit,
        );
        return recentHistory.every((msg) => msg.role === "assistant");
    }

    async initiateAvatarInteraction(avatar, channel) {
        const otherAvatars = this.avatars.filter((a) => a.name !== avatar.name);
        const otherAvatar =
            otherAvatars[Math.floor(Math.random() * otherAvatars.length)];

        const result = await this.chatWithAI(otherAvatar);

        if (result.trim() !== "") {
            console.log(
                `🧠 ${otherAvatar.name} responds to ${avatar.name}:`,
                result,
            );
            await this.sendAsAvatar(result, channel, otherAvatar);
        }
    }

    async chatWithAI(avatar) {
        const context = this.conversationHistories[avatar.name] || [];

        try {
            const response = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content: `You are ${avatar.name}. ${avatar.personality}. Only respond with one or two sentence replies unless asked to explain in detail.`,
                    },
                    ...context,
                    {
                        role: "user",
                        content:
                            "respond naturally to the above conversation, in character, driving the narrative forward and pursuing your goals.",
                    },
                ],
            });

            return response.choices[0].message.content || "";
        } catch (error) {
            console.error("🧠 AI chat error:", error);
            return "";
        }
    }

    async sendAsAvatar(message, channel, avatar) {
        if (!channel) {
            console.error(`🧠 Channel not found: ${avatar.location}`);
            return;
        }

        const webhookData = await this.getOrCreateWebhook(channel, avatar);
        const chunks = chunkText(message, 2000);

        for (const chunk of chunks) {
            if (chunk.trim() !== "") {
                try {
                    if (webhookData) {
                        const { client: webhook, threadId } = webhookData;
                        await webhook.send({
                            content: chunk,
                            username:
                                `${avatar.name} ${avatar.emoji || ""}`.trim(),
                            avatarURL: avatar.avatar,
                            threadId: threadId,
                        });
                    } else {
                        await channel.send(
                            `**${avatar.name} ${avatar.emoji || ""}:** ${chunk}`,
                        );
                    }
                } catch (error) {
                    console.error(
                        `🧠 Failed to send message as ${avatar.name}:`,
                        error,
                    );
                }
            }
        }
    }

    async getOrCreateWebhook(channel, avatar) {
        if (this.webhookCache[channel.id]) {
            return this.webhookCache[channel.id];
        }

        let targetChannel = channel;
        let threadId = null;

        if (channel.isThread()) {
            threadId = channel.id;
            targetChannel = channel.parent;
        }

        if (!targetChannel.isTextBased()) {
            return null;
        }

        try {
            const webhooks = await targetChannel.fetchWebhooks();
            let webhook = webhooks.find(
                (wh) => wh.owner.id === this.client.user.id,
            );

            if (
                !webhook &&
                targetChannel
                    .permissionsFor(this.client.user)
                    .has("MANAGE_WEBHOOKS")
            ) {
                webhook = await targetChannel.createWebhook({
                    name: `${avatar.name} Webhook`,
                    avatar: avatar.avatar,
                });
            }

            if (webhook) {
                const webhookClient = new WebhookClient({
                    id: webhook.id,
                    token: webhook.token,
                });
                this.webhookCache[channel.id] = {
                    client: webhookClient,
                    threadId,
                };
                return this.webhookCache[channel.id];
            }
        } catch (error) {
            console.error("🧠 Error fetching or creating webhook:", error);
        }

        return null;
    }

    async handleMessage(message) {
        try {
            // Check if the message is from an avatar to avoid self-replying
            if (this.isAvatarMessage(message)) return;

            // Determine if any avatar name is mentioned in the message
            const mentionedAvatar = this.findMentionedAvatar(message);

            // Always process messages in an avatar's home channel
            const isHomeChannel = this.isHomeChannel(message.channel.id);
            if (!mentionedAvatar && !isHomeChannel) return;

            const targetAvatar =
                mentionedAvatar || this.getHomeChannelAvatar(message.channel.id);

            if (targetAvatar) {
                // Update the last mentioned channel for the avatar if it's not their home channel
                if (!isHomeChannel) {
                    this.lastMentionedChannels[targetAvatar.name] = {
                        channel: message.channel.id,
                        timestamp: Date.now(),
                    };
                }

                // Process the message content and images
                const content = message.content.trim();
                const imageUrls = message.attachments
                    .filter((att) => att.contentType.startsWith("image/"))
                    .map((att) => ({
                        type: "image_url",
                        image_url: {
                            url: att.url,
                            detail: "auto",
                        },
                    }));

                if (content === "" && imageUrls.length === 0) return;

                const messageContent = [];
                if (content !== "") {
                    messageContent.push({
                        type: "text",
                        text: `(${message.channel.name}) ${message.author.username}: ${content}`,
                    });
                }

                // Add message to the conversation history
                this.addToConversationHistory(targetAvatar.name, {
                    role: "user",
                    content: [...messageContent, ...imageUrls],
                });

                // Process the message with a debounce
                // Usage in handleMessage:
                this.debounce(`${avatar.name}-${message.channel.id}`, async () => {
                    await this.processMessages(message.channel, targetAvatar);
                });

                // Handle decay of the dynamic channel
                this.handleChannelDecay(targetAvatar);
            }
        } catch (error) {
            console.error("🧠 Error handling message:", error);
        }
    }

    isHomeChannel(channelId) {
        return this.avatars.some((avatar) => avatar.homeChannel === channelId);
    }

    getHomeChannelAvatar(channelId) {
        return this.avatars.find((avatar) => avatar.homeChannel === channelId);
    }

    async handleChannelDecay(avatar) {
        const lastMention = this.lastMentionedChannels[avatar.name];
        const isHomeChannel = avatar.homeChannel === lastMention?.channel;

        // If the avatar is mentioned in a non-home channel, remove it after a decay time
        if (
            lastMention &&
            !isHomeChannel &&
            Date.now() - lastMention.timestamp > this.channelDecayTime
        ) {
            delete this.lastMentionedChannels[avatar.name];
            console.log(
                `🕒 ${avatar.name} has decayed back to their home channel.`,
            );
        }
    }

    async connectToMongoDB() {
        try {
            await this.mongoClient.connect();
            this.db = this.mongoClient.db("ratipathology_db");
            this.avatarsCollection = this.db.collection("avatars");
            this.memoryCollection = this.db.collection("memories");

            const avatarsFromJson = JSON.parse(
                fs.readFileSync("characters.json", "utf-8"),
            );

            for (const avatar of avatarsFromJson) {
                const existingAvatar = await this.avatarsCollection.findOne({
                    name: avatar.name,
                });
                if (!existingAvatar) {
                    await this.avatarsCollection.insertOne(avatar);
                } else {
                    await this.avatarsCollection.updateOne(
                        { name: avatar.name },
                        { $set: avatar },
                    );
                }
            }

            console.log("🧠 Connected to MongoDB");
        } catch (error) {
            console.error("🧠 MongoDB Connection Error:", error);
            process.exit(1);
        }
    }

    async loadAvatars() {
        try {
            this.avatars = await this.avatarsCollection.find().toArray();
            console.log(
                "🧠 Avatars loaded:",
                this.avatars.map((avatar) => avatar.name),
            );
        } catch (error) {
            console.error("🧠 Failed to load avatars from MongoDB:", error);
        }
    }

    async dailyRoutine() {
        for (const avatar of this.avatars) {
            await this.performDailyDream(avatar);
            await this.summarizeMemories(avatar);
            await this.setDailyGoal(avatar);
        }
    }

    async performDailyDream(avatar) {
        const dream = await this.chatWithAI(avatar);
        await this.memoryCollection.insertOne({
            avatar: avatar.name,
            type: "dream",
            content: dream,
            date: new Date(),
        });
        console.log(`💤 ${avatar.name}'s dream:`, dream);
    }

    async summarizeMemories(avatar) {
        const summary = await this.summarizeConversationHistory(avatar.name);
        await this.memoryCollection.insertOne({
            avatar: avatar.name,
            type: "summary",
            content: summary,
            date: new Date(),
        });
        console.log(`🧠 ${avatar.name}'s memory summary:`, summary);
    }

    async setDailyGoal(avatar) {
        const goal = await this.chatWithAI(avatar);
        await this.memoryCollection.insertOne({
            avatar: avatar.name,
            type: "goal",
            content: goal,
            date: new Date(),
        });
        console.log(`🎯 ${avatar.name}'s goal:`, goal);
    }

    async summarizeConversationHistory(avatarName) {
        try {
            const summaryResponse = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: "system",
                        content:
                            "Summarize the following conversation history:",
                    },
                    ...this.conversationHistories[avatarName],
                ],
            });

            const summary = summaryResponse.choices[0].message.content.trim();
            console.log(`🧠 ${avatarName} Conversation Summary:`, summary);
            return summary;
        } catch (error) {
            console.error(
                "🧠 Failed to summarize conversation history:",
                error,
            );
            return "";
        }
    }

    async login() {
        try {
            await this.client.login(this.token);
        } catch (error) {
            console.error("🧠 Failed to login:", error);
            throw error;
        }
    }
}

const ratipath = new RatipathBot();
ratipath.login();
