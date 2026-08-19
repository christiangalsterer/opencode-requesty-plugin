import { readSettings } from "./src/settings"
const configInput = {
    "sidebar": { "showKeyName": true },
    "prompt": { "showKeyName": true }
}
try {
    const settings = readSettings(configInput)
    console.log("Settings parsed successfully:", settings)
} catch (e) {
    console.error("Error parsing settings:", e)
}
