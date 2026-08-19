import { readSettings } from "./src/settings"
const options = {
    "sidebar": {
        "showKeyName": true
    },
    "prompt": {
        "showKeyName": true
    }
}
try {
    const settings = readSettings(options)
    console.log(JSON.stringify(settings, null, 2))
} catch (e) {
    console.error(e)
}
