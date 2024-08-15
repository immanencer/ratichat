import fs from 'fs';

class ImageAnalyzer {
    constructor(openai) {
        this.openai = openai;
    }

    async analyzeImageUrl(imageUrl, query = "Provided a detailed and highly technical analysis of this image.", detail = "auto") {
        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: query },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageUrl,
                                    detail: detail,
                                }
                            }
                        ]
                    }
                ]
            });

            return this.parseResponse(response);
        } catch (error) {
            console.error('🧠 Image analysis failed:', error);
            throw new Error('Failed to analyze image');
        }
    }

    async analyzeBase64Image(imagePath, query = "What’s in this image?", detail = "auto") {
        try {
            const base64Image = this.encodeImageToBase64(imagePath);

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: query },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64Image}`,
                                    detail: detail,
                                }
                            }
                        ]
                    }
                ]
            });

            return this.parseResponse(response);
        } catch (error) {
            console.error('🧠 Image analysis failed:', error);
            throw new Error('Failed to analyze image');
        }
    }

    async analyzeMultipleImages(imageUrls, query = "Provide a detailed comparison of these images.", detail = "auto") {
        try {
            const content = [{ type: "text", text: query }];

            for (const imageUrl of imageUrls) {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: imageUrl,
                        detail: detail
                    }
                });
            }

            const response = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: content }],
            });

            return this.parseResponse(response);
        } catch (error) {
            console.error('🧠 Image analysis failed:', error);
            throw new Error('Failed to analyze images');
        }
    }

    encodeImageToBase64(imagePath) {
        try {
            const image = fs.readFileSync(imagePath);
            return image.toString('base64');
        } catch (error) {
            console.error('🧠 Failed to encode image to base64:', error);
            throw new Error('Failed to encode image to base64');
        }
    }

    parseResponse(response) {
        if (response && response.choices && response.choices.length > 0) {
            return response.choices[0].message.content.trim();
        } else {
            throw new Error("No analysis returned.");
        }
    }
}

export default ImageAnalyzer;
