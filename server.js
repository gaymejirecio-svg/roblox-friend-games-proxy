const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.post("/friend-games", async (req, res) => {
  try {
    const friends = req.body.friends || [];
    const games = [];

    for (const friend of friends.slice(0, 50)) {
      const userId = friend.userId;

      const url = `https://games.roblox.com/v2/users/${userId}/games?accessFilter=Public&limit=10&sortOrder=Desc`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();

      for (const game of data.data || []) {
        games.push({
          friendUserId: userId,
          friendUsername: friend.username,
          friendDisplayName: friend.displayName,

          name: game.name,
          description: game.description || "No description.",
          placeId: game.rootPlace?.id,
          universeId: game.id,

          visits: game.placeVisits || 0,
          favorites: game.favoritedCount || "?",
          likes: "?",
          dislikes: "?"
        });
      }
    }

    res.json({ games });
  } catch (err) {
    console.error(err);
    res.status(500).json({ games: [] });
  }
});

app.get("/", (req, res) => {
  res.send("Roblox friend games proxy is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Proxy running on port " + PORT);
});
