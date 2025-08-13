// author @GwenDev
import fs from "fs";

const cookie = JSON.parse(fs.readFileSync("./App/Cookie.json", "utf-8"));

export const settings = {
    imei: "3011b8eb-f28f-40ef-a125-ae98cfa41766-0fe6feb54289f4c67027ec06cc2131f8",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    cookie,
    prefix: ".",
    geminiApiKey: process.env.GEMINI_API_KEY || "AIzaSyANli4dZGQGSF2UEjG9V-X0u8z56Zm8Qmc",
    geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    dpasteApi: process.env.DPASTE_API || "https://dpaste.com/api/v2/",
    dpasteToken: process.env.DPASTE_TOKEN || "c087cb45e6f9fd75",
};
