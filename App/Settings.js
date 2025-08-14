// author @GwenDev
import fs from "fs";

const cookie = JSON.parse(fs.readFileSync("./App/Cookie.json", "utf-8"));

export const settings = {
    imei: "3011b8eb-f28f-40ef-a125-ae98cfa41766-0fe6feb54289f4c67027ec06cc2131f8",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    cookie,
    prefix: ".",
	    apis: {
		    gemini: {
			    key: process.env.GEMINI_API_KEY || "AIzaSyANli4dZGQGSF2UEjG9V-X0u8z56Zm8Qmc",
			    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
		    },
		    dpaste: {
			    baseUrl: process.env.DPASTE_API || "https://dpaste.com/api/v2/",
			    token: process.env.DPASTE_TOKEN || "c087cb45e6f9fd75",
		    },
		    zmp3: {
			    apiKey: process.env.ZMP3_API_KEY || "X5BM3w8N7MKozC0B85o4KMlzLZKhV00y",
			    secretKey: process.env.ZMP3_SECRET_KEY || "acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW",
			    version: process.env.ZMP3_VERSION || "1.11.13",
			    baseUrl: process.env.ZMP3_BASE_URL || "https://zingmp3.vn",
		    },
		    spt: {
			    endpoints: {
				    spotify: {
					    token: "https://accounts.spotify.com/api/token",
					    search: "https://api.spotify.com/v1/search",
					    track: "https://api.spotify.com/v1/tracks",
				    },
				    lastfm: "https://ws.audioscrobbler.com/2.0/",
				    lyrics: "https://api.lyrics.ovh/v1",
				    itunes: "https://itunes.apple.com/search",
				    niio_download: "https://niio-team.onrender.com/downr",
				    spotify_download: "https://cdn-spotify.zm.io.vn/download",
			    },
			    keys: {
				    spotify: {
					    clientId: process.env.SPT_SPOTIFY_CLIENT_ID || "b9d2557a2dd64105a37f413fa5ffcda4",
					    clientSecret: process.env.SPT_SPOTIFY_CLIENT_SECRET || "41bdf804974e4e70bfa0515bb3097fbb",
				    },
				    lastfm: process.env.SPT_LASTFM_KEY || "8b2b23434b950d63b0de86e2bb2b97a7",
			    },
		    },
	    },
};
