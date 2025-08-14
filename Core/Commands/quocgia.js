// author @GwenDev
import axios from "axios";

export default {
  name: "quocgia",
  description: "Tra cứu thông tin về một quốc gia",
  role: 0,
  cooldown: 5,
  group: "other",
  aliases: ["countryinfo", "quốc gia"],
  noPrefix: false,

  async run({ message, api, args }) {
    const threadId = message.threadId;
    const threadType = message.type;

    if (!args || args.length === 0) {
      return api.sendMessage({
        msg: "Vui lòng cung cấp tên quốc gia. Ví dụ: .quocgia viet nam",
        ttl: 12 * 60 * 60_000
      }, threadId, threadType);
    }

    const query = args.join(" ").trim();
    const countryName = encodeURIComponent(query);
    const fields = [
      "name",
      "capital",
      "region",
      "population",
      "languages",
      "timezones",
      "continents",
      "maps",
      "flags"
    ].join(",");
    const url = `https://restcountries.com/v3.1/name/${countryName}?fields=${fields}`;

    try {
      const res = await axios.get(url, { timeout: 15000 });
      const list = Array.isArray(res.data) ? res.data : [];
      if (list.length === 0) {
        return api.sendMessage({
          msg: `Không tìm thấy thông tin cho quốc gia "${query}".`,
          ttl: 12 * 60 * 60_000
        }, threadId, threadType);
      }

      const info = list[0];
      const name = info?.name?.common || query;
      const officialName = info?.name?.official || "N/A";
      const capital = Array.isArray(info?.capital) && info.capital[0] ? info.capital[0] : "N/A";
      const region = info?.region || "N/A";
      const population = typeof info?.population === "number" ? info.population.toLocaleString("vi-VN") : "N/A";
      const languages = info?.languages ? Object.values(info.languages).join(", ") : "N/A";
      const timezones = Array.isArray(info?.timezones) ? info.timezones.join(", ") : "N/A";
      const continents = Array.isArray(info?.continents) ? info.continents.join(", ") : "N/A";
      const googleMaps = info?.maps?.googleMaps || "N/A";
      const openStreetMaps = info?.maps?.openStreetMaps || "N/A";
      const flagsPNG = info?.flags?.png || null;
      const flagsSVG = info?.flags?.svg || null;

      const lines = [
        `🌎 Quốc gia: ${name} (${officialName})`,
        `⛩️ Thủ đô: ${capital}`,
        `🧭 Khu vực: ${region}`,
        `👥 Dân số: ${population}`,
        `📝 Ngôn ngữ: ${languages}`,
        `⏳ Múi giờ: ${timezones}`,
        `🗺️ Lục địa: ${continents}`,
        `📍 Google Maps: ${googleMaps}`,
        `🗾 OpenStreetMap: ${openStreetMaps}`,
      ];

      if (flagsPNG || flagsSVG) {
        lines.push("", "🔱 Cờ:");
        if (flagsPNG) lines.push(`[PNG] ${flagsPNG}`);
        if (flagsSVG) lines.push(`[SVG] ${flagsSVG}`);
      }

      return api.sendMessage({ msg: lines.join("\n"), ttl: 12 * 60 * 60_000 }, threadId, threadType);
    } catch (err) {
      console.error("[quocgia] error:", err?.message || err);
      return api.sendMessage({
        msg: "Đã xảy ra lỗi khi tìm thông tin quốc gia. Vui lòng thử lại sau.",
        ttl: 12 * 60 * 60_000
      }, threadId, threadType);
    }
  },
};


