import fs from "fs";

const cookie = JSON.parse(fs.readFileSync("./App/Cookie.json", "utf-8"));

export const settings = {
    imei: "",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36",
    cookie,
    prefix: "."
};