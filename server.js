const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "3mb" }));

async function getJson(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 FriendGamesProxy"
      }
    });

    if (!res.ok) {
      console.log("FAILED:", res.status, url);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.log("FETCH ERROR:", url, err.message);
    return null;
  }
}

function chunkArray(arr, size) {
  const chunks = [];

  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }

  return chunks;
}

async function getUserGames(friend) {
  const url =
    `https://games.roblox.com/v2/users/${friend.userId}/games` +
    "?accessFilter=Public&limit=50&sortOrder=Desc";

  const data = await getJson(url);
  const games = [];

  for (const game of data?.data || []) {
    if (!game.id || !game.rootPlace?.id) continue;

    games.push({
      friendUserId: friend.userId,
      friendUsername: friend.username,
      friendDisplayName: friend.displayName,

      universeId: game.id,
      placeId: game.rootPlace.id,

      name: game.name || "Unknown Game",
      description: game.description || "No description.",

      visits: game.placeVisits || 0,
      playing: game.playing || 0,
      favorites: game.favoritedCount || 0,

      maxPlayers: game.maxPlayers || 0,
      created: game.created || "",
      updated: game.updated || "",
      genre: game.genre || "Unknown"
    });
  }

  return games;
}

async function getGameDetails(universeIds) {
  const details = {};

  for (const chunk of chunkArray(universeIds, 50)) {
    const url =
      "https://games.roblox.com/v1/games" +
      `?universeIds=${chunk.join(",")}`;

    const data = await getJson(url);

    for (const game of data?.data || []) {
      details[game.id] = {
        name: game.name || "Unknown Game",
        description: game.description || "No description.",
        visits: game.visits || 0,
        playing: game.playing || 0,
        favorites: game.favoritedCount || 0,
        maxPlayers: game.maxPlayers || 0,
        created: game.created || "",
        updated: game.updated || "",
        genre: game.genre || "Unknown",
        creatorName: game.creator?.name || "",
        creatorId: game.creator?.id || 0
      };
    }
  }

  return details;
}

async function getVotes(universeIds) {
  const votes = {};

  for (const chunk of chunkArray(universeIds, 100)) {
    const url =
      "https://games.roblox.com/v1/games/votes" +
      `?universeIds=${chunk.join(",")}`;

    const data = await getJson(url);

    for (const item of data?.data || []) {
      votes[item.id] = {
        likes: item.upVotes || 0,
        dislikes: item.downVotes || 0
      };
    }
  }

  return votes;
}

async function getIcons(universeIds) {
  const icons = {};

  for (const chunk of chunkArray(universeIds, 100)) {
    const url =
      "https://thumbnails.roblox.com/v1/games/icons" +
      `?universeIds=${chunk.join(",")}` +
      "&size=512x512&format=Png&isCircular=false";

    const data = await getJson(url);

    for (const item of data?.data || []) {
      icons[item.targetId] = item.imageUrl || "";
    }
  }

  return icons;
}

async function getThumbnails(universeIds) {
  const thumbnails = {};

  for (const id of universeIds) {
    const url =
      "https://thumbnails.roblox.com/v1/games/multiget/thumbnails" +
      `?universeIds=${id}` +
      "&countPerUniverse=10&defaults=true&size=768x432&format=Png&isCircular=false";

    const data = await getJson(url);

    for (const item of data?.data || []) {
      thumbnails[item.universeId] = (item.thumbnails || [])
        .map(t => t.imageUrl)
        .filter(Boolean);
    }
  }

  return thumbnails;
}

app.post("/friend-games", async (req, res) => {
  try {
    const friends = req.body.friends || [];
    const rawGames = [];

    console.log("Friends received:", friends.length);

    for (const friend of friends.slice(0, 50)) {
      const games = await getUserGames(friend);
      rawGames.push(...games);
    }

    const universeIds = [...new Set(rawGames.map(g => g.universeId))];

    console.log("Games found:", universeIds.length);

    const [details, votes, icons, thumbnails] = await Promise.all([
      getGameDetails(universeIds),
      getVotes(universeIds),
      getIcons(universeIds),
      getThumbnails(universeIds)
    ]);

    const games = rawGames.map(game => {
      const detail = details[game.universeId] || {};
      const vote = votes[game.universeId] || { likes: 0, dislikes: 0 };

      const likes = vote.likes || 0;
      const dislikes = vote.dislikes || 0;
      const totalVotes = likes + dislikes;

      const likePercent =
        totalVotes > 0 ? Math.round((likes / totalVotes) * 100) : 0;

      return {
        ...game,

        name: detail.name || game.name,
        description: detail.description || game.description,

        visits: detail.visits || game.visits || 0,
        playing: detail.playing || game.playing || 0,
        favorites: detail.favorites || game.favorites || 0,

        maxPlayers: detail.maxPlayers || game.maxPlayers || 0,
        created: detail.created || game.created || "",
        updated: detail.updated || game.updated || "",
        genre: detail.genre || game.genre || "Unknown",

        likes,
        dislikes,
        likePercent,

        icon: icons[game.universeId] || "",
        thumbnails: thumbnails[game.universeId] || []
      };
    });

    games.sort((a, b) => {
      return (b.visits || 0) - (a.visits || 0);
    });

    res.json({ games });
  } catch (err) {
    console.error("SERVER ERROR:", err);
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
