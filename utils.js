export function chunkText(text, maxLength) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + maxLength, text.length);
        chunks.push(text.substring(start, end));
        start = end;
    }
    return chunks;
}

export async function saveMessageToDatabase(db, messageData) {
    try {
        const messagesCollection = db.collection('messages');
        await messagesCollection.insertOne({
            ...messageData,
            timestamp: new Date(),
        });
        console.log(`💾 Message saved: ${messageData.content}`);
    } catch (error) {
        console.error('🧠 Failed to save message to database:', error);
    }
}
