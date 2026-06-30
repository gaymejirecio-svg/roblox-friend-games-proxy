const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

async function getThumbnails(universeIds) {
  if (universeIds.length === 0) return {};

  const url =
    "https://thumbnails.roblox.com/v1/games/multiget/thumbnails" +
    `?universeIds=${universeIds.join(",")}` +
    "&countPerUniverse=5&defaults=true&size=768x432&format=Png&isCircular=false";

  const data = await getJson(url);
  const map = {};

  for (const item of data?.data || []) {
    map[item.universeId] = (item.thumbnails || [])
      .map(t => t.imageUrl)
      .filter(Boolean);
  }

  return map;
}

async function getVotes(universeIds) {
  if (universeIds.length === 0) return {};

  const url =
    "https://games.roblox.com/v1/games/votes" +
    `?universeIds=${universeIds.join(",")}`;

  const data = await getJson(url);
  const map = {};

  for (const item of data?.data || []) {
    map[item.id] = {
      likes: item.upVotes || 0,
      dislikes: item.downVotes || 0,
    };
  }

  return map;
}

app.post("/friend-games", async (req, res) => {
  try {
    const friends = req.body.friends || [];
    const rawGames = [];

    for (const friend of friends.slice(0, 50)) {
      const userId = friend.userId;

      const userGamesUrl =
        `https://games.roblox.com/v2/users/${userId}/games` +
        "?accessFilter=Public&limit=10&sortOrder=Desc";

      const gameData = await getJson(userGamesUrl);
      if (!gameData) continue;

      for (const game of gameData.data || []) {
        if (!game.rootPlace?.id) continue;

        rawGames.push({
          friendUserId: userId,
          friendUsername: friend.username,
          friendDisplayName: friend.displayName,

          name: game.name || "Unknown Game",
          description: game.description || "No description.",
          placeId: game.rootPlace.id,
          universeId: game.id,

          visits: game.placeVisits || 0,
          favorites: game.favoritedCount || 0,
          playing: game.playing || 0,
          maxPlayers: game.maxPlayers || "?",
          created: game.created || "",
          updated: game.updated || "",
          genre: game.genre || "Unknown",
        });
      }
    }

    const universeIds = rawGames.map(g => g.universeId);
    const thumbnails = await getThumbnails(universeIds);
    const votes = await getVotes(universeIds);

    const games = rawGames.map(game => {
      const voteData = votes[game.universeId] || { likes: 0, dislikes: 0 };
      const totalVotes = voteData.likes + voteData.dislikes;
      const likePercent = totalVotes > 0
        ? Math.round((voteData.likes / totalVotes) * 100)
        : 0;

      return {
        ...game,
        thumbnails: thumbnails[game.universeId] || [],
        likes: voteData.likes,
        dislikes: voteData.dislikes,
        likePercent,
      };
    });

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
