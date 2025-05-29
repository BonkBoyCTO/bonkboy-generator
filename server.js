require("dotenv").config();
const express = require("express");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const bodyParser = require("body-parser");

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, ".")));
app.use("/memes", express.static(path.join(__dirname, "memes")));

const MEME_FILE = path.join(__dirname, "memes.json");

// Save meme locally and log to memes.json
async function saveMemeEntry(imageUrl, wallet) {
  const memes = fs.existsSync(MEME_FILE)
    ? JSON.parse(fs.readFileSync(MEME_FILE, "utf8"))
    : [];

  const filename = `${uuidv4()}.png`;
  const localPath = path.join(__dirname, "memes", filename);

  try {
    const response = await axios({ url: imageUrl, responseType: "stream" });
    await new Promise((resolve, reject) => {
      const stream = response.data.pipe(fs.createWriteStream(localPath));
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    memes.push({
      url: `/memes/${filename}`,
      wallet,
      timestamp: Date.now(),
    });

    fs.writeFileSync(MEME_FILE, JSON.stringify(memes, null, 2));
    return filename;
  } catch (err) {
    console.error("Failed to download image:", err.message);
    return null;
  }
}

app.post("/generate", async (req, res) => {
  const { prompt, style, wallet = "anonymous", strictBonkboy = false } = req.body;

  if (!prompt || prompt.trim() === "") {
    return res.status(400).json({ error: "Prompt is required." });
  }

  // ✅ Daily meme limit per wallet (20)
  const memes = fs.existsSync(MEME_FILE)
    ? JSON.parse(fs.readFileSync(MEME_FILE, "utf8"))
    : [];

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const walletMemesToday = memes.filter(
    (m) =>
      (m.wallet || "anonymous").toLowerCase() === wallet.toLowerCase() &&
      m.timestamp >= todayStart.getTime()
  );

  if (walletMemesToday.length >= 100) {
    return res
      .status(429)
      .json({ error: "Daily limit reached. You can generate 20 memes per day." });
  }

  try {
    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You're a creative meme assistant for a character named BonkBoy. Make short, funny visual meme prompts based on user input.",
        },
        {
          role: "user",
          content: `Make this meme idea more vivid and fun: ${prompt}`,
        },
      ],
      max_tokens: 60,
    });

    const enhancedPrompt = gptResponse.choices[0].message.content;
    console.log("✨ Enhanced prompt from GPT:", enhancedPrompt);

    const strictDescription = strictBonkboy
      ? "The character must exactly match BonkBoy's look: red hoodie with a 'B' on the chest, forward red cap with drink cans on both sides labeled HODL JUICE and ENGINE PUMP."
      : "";

    const fullPrompt = `A funny cartoon of a boy named BonkBoy wearing a red hoodie and cap, holding a glowing bat labeled BONK. Style: Comic book. Crypto meme style.`;
    

    console.log("🖼️ Prompt sent to DALL·E:", fullPrompt);

    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: fullPrompt,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = imageResponse.data[0].url;
    const filename = await saveMemeEntry(imageUrl, wallet);

    if (!filename) {
      return res.status(500).json({ error: "Failed to save image locally." });
    }

    res.json({ imageUrl: `/memes/${filename}` });
  } catch (error) {
    console.error("❌ OpenAI error:", error);
    res.status(500).json({ error: "Image generation failed. Try again." });
  }
});

app.get("/gallery", (req, res) => {
  try {
    const memes = fs.existsSync(MEME_FILE)
      ? JSON.parse(fs.readFileSync(MEME_FILE, "utf8"))
      : [];
    res.json(memes.slice(-50));
  } catch (err) {
    res.status(500).json({ error: "Failed to load gallery." });
  }
});

app.get("/gallery/:wallet", (req, res) => {
  const wallet = req.params.wallet.toLowerCase();
  try {
    const memes = fs.existsSync(MEME_FILE)
      ? JSON.parse(fs.readFileSync(MEME_FILE, "utf8"))
      : [];
    const filtered = memes.filter(
      (meme) => (meme.wallet || "").toLowerCase() === wallet
    );
    res.json(filtered.slice(-50));
  } catch (err) {
    res.status(500).json({ error: "Failed to load user gallery." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});