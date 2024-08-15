# RatipathBot

**RatipathBot** is a Discord bot built with the ability to manage multiple avatars, each with their own conversation histories, daily routines, and autonomous interactions. This bot integrates OpenAI's GPT-4 for conversational capabilities, MongoDB for persistent memory, and Discord.js for interaction with Discord channels.

## Features

- **Multi-Avatar Support**: Each avatar operates independently in its own Discord channel, maintaining a unique personality and conversation history.
- **Image Analysis**: The bot can analyze images shared in channels and provide insights based on the content.
- **Autonomous Interactions**: Avatars can continue conversations autonomously within their channels and occasionally interact with other avatars.
- **Daily Routines**: Each avatar generates daily dreams, summarizes memories, and sets goals, all of which are stored in MongoDB.
- **Persistent Memory**: Avatar-specific conversation histories, dreams, memory summaries, and goals are stored and retrieved from MongoDB, allowing for long-term consistency in behavior.
- **Webhook Integration**: Messages are sent from avatars via Discord webhooks, ensuring that each avatar is properly represented in its respective channel.

## Installation

### Prerequisites

- **Node.js** (v14 or higher)
- **MongoDB** instance
- **Discord Bot Token**
- **OpenAI API Key**

### Setup

1. **Clone the Repository**

   ```bash
   git clone https://github.com/yourusername/ratipathbot.git
   cd ratipathbot
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment Variables**

   Create a `.env` file in the root directory with the following variables:

   ```
   DISCORD_BOT_TOKEN=your-discord-bot-token
   MONGODB_URI=your-mongodb-uri
   OPENAI_API_KEY=your-openai-api-key
   ```

4. **Prepare Avatar Data**

   Add your avatar definitions to a `characters.json` file in the root directory. Each avatar should have the following structure:

   ```json
   [
     {
       "name": "AvatarName",
       "location": "channel-name",
       "personality": "Description of the avatar's personality.",
       "avatar": "url-to-avatar-image",
       "emoji": "emoji-representation"
     }
   ]
   ```

5. **Run the Bot**

   ```bash
   node index.js
   ```

## Usage

### Message Handling

- The bot listens to messages in Discord channels. If a message contains an image, it will analyze the image and respond with a detailed analysis.
- The bot maintains a conversation history for each avatar, allowing it to remember past interactions and respond contextually.

### Autonomous Avatar Interactions

- Avatars can interact with each other within their channels, with a limit of 3-4 bot-generated messages before requiring human input.

### Daily Routines

- **Dream Generation**: Each day, avatars generate dreams based on recent experiences and emotions.
- **Memory Summarization**: Avatars summarize their recent conversations and store the summaries.
- **Goal Setting**: Based on their memories and dreams, avatars set daily goals.

### Webhook Management

- The bot uses Discord webhooks to send messages, ensuring that each avatar's messages are properly attributed.

## File Structure

```
ratipathbot/
├── index.js               # Main entry point
├── imageAnalyzer.js       # Image analysis module
├── characters.json        # Avatar definitions
├── .env                   # Environment variables
└── README.md              # Project documentation
```

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes. Ensure that all new features are well-tested and documented.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Contact

If you have any questions or need support, please open an issue on GitHub or contact the project maintainer.

---

Enjoy using **RatipathBot** and creating engaging, autonomous avatars in your Discord server!