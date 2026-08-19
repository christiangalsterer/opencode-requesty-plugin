import { readSettings } from "./src/settings"
try {
    const raw = {
        "sidebar": { "showKeyName": true },
        "prompt": { "showKeyName": true }
    }
    readSettings(raw)
    console.log("Success")
} catch (e) {
    console.error(e)
}
