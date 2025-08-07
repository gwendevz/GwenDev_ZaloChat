import fs from "fs";

const cookie = JSON.parse(fs.readFileSync("./App/Cookie.json", "utf-8"));

export const settings = {
    imei: "",
    userAgent: "",
    cookie,
    prefix: "."
};