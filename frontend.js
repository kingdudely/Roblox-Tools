const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const assetType = {
    1: "Image",
    2: "TShirt",
    3: "Audio",
    4: "Mesh",
    5: "Lua",
    8: "Hat",
    9: "Place",
    10: "Model",
    11: "Shirt",
    12: "Pants",
    13: "Decal",
    17: "Head",
    18: "Face",
    19: "Gear",
    21: "Badge",
    24: "Animation",
    27: "Torso",
    28: "RightArm",
    29: "LeftArm",
    30: "LeftLeg",
    31: "RightLeg",
    32: "Package",
    34: "GamePass",
    38: "Plugin",
    40: "MeshPart",
    41: "HairAccessory",
    42: "FaceAccessory",
    43: "NeckAccessory",
    44: "ShoulderAccessory",
    45: "FrontAccessory",
    46: "BackAccessory",
    47: "WaistAccessory",
    48: "ClimbAnimation",
    49: "DeathAnimation",
    50: "FallAnimation",
    51: "IdleAnimation",
    52: "JumpAnimation",
    53: "RunAnimation",
    54: "SwimAnimation",
    55: "WalkAnimation",
    56: "PoseAnimation",
    57: "EarAccessory",
    58: "EyeAccessory",
    61: "EmoteAnimation",
    62: "Video",
    64: "TShirtAccessory",
    65: "ShirtAccessory",
    66: "PantsAccessory",
    67: "JacketAccessory",
    68: "SweaterAccessory",
    69: "ShortsAccessory",
    70: "LeftShoeAccessory",
    71: "RightShoeAccessory",
    72: "DressSkirtAccessory",
    73: "FontFamily",
    76: "EyebrowAccessory",
    77: "EyelashAccessory",
    78: "MoodAnimation",
    79: "DynamicHead"
};

function sanitize(name) {
    let encoded = textEncoder.encode(name).slice(0, 255); // 255 byte limit for Linux/Unix and 255 character for Windows
    name = textDecoder.decode(encoded);

    return name
        .normalize()
        .replace(/\uFFFD/g, '') // Characters that were bugged after trim
        .replace(/^\.+$/, '') // . and .. are reserved by Unix
        .replace(/[\. ]+$/, '') // Illegal trailing periods/spaces in Windows
        .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i) // Reserved Windows file names
        .replace(/\s+/g, '_') // Remove spaces for more compatibility
        .replace(/[^a-zA-Z0-9._-]/g, '') // Only allow alphanumeric characters (including _ - .)
};

function getFileType(buffer, info) { // details, data
    try {
        // Check if buffer is JSON
        JSON.parse(textDecoder.decode(buffer));
        return ["json", "application/json"];
    }
    catch {
        // let result = ["txt", "text/plain"]
        const data = new Uint8Array(buffer);
        const isRobloxPlace = assetType[info?.assetTypeId] === "Place";

        const extensions = [
            [[137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82], "png", "image/png"],
            [[255, 216, 255], "jpg", "image/jpg"], // [0xFF, 0xD8, 0xFF]
            [[79, 103, 103, 83], "ogg", "audio/ogg"], // [0x4F, 0x67, 0x67, 0x53]
            [[0, 1, 0, 0, 0], "ttf", "font/ttf"],
            [[60, 114, 111, 98, 108, 111, 120, 33], isRobloxPlace ? "rbxl" : "rbxm", "application/octet-stream"],
            [[60, 114, 111, 98, 108, 111, 120], isRobloxPlace ? "rbxlx" : "rbxmx", "application/xml"]
        ];

        for (let [signature, extension, mime] of extensions) { // MIME-type
            if (signature.every((byte, index) => byte === data[index])) {
                return [extension, mime];
            }
        }

        return ["txt", "text/plain"];
    }
};

async function getDetails(id) {
    return fetch(`https://economy.roblox.com/v2/assets/${id}/details`).then(response => response.json()); // roproxy
};

function getCookie(url = "https://www.roblox.com", name = ".ROBLOSECURITY") {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "getCookie",
            url,
            name
        }, (cookie) => {
            if (cookie)
                resolve(cookie.value);
            else
                reject("Cookie not found");
        });
    });
};

function setCookie(arguments) { // parameters
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
            action: "setCookie",
            ...arguments
        }, (cookie) => {
            if (cookie)
                resolve(cookie);
            else
                reject("Cookie not found");
        });
    });
}

function download(buffer, filename, info) {
    filename = sanitize(filename);

    // Filename and extension
    let [extension, type] = getFileType(buffer, info);
    extension = "." + extension;

    if (!filename.endsWith(extension)) {
        filename += extension;
    }

    // Download
    const blob = new Blob([buffer], {type});

    // Link that downloads the file when clicked
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click();

    URL.revokeObjectURL(link.href);
};

async function fetchAsset(assetId, placeId, assetType = "Audio") { // Only for audios right now
    return fetch("https://assetdelivery.roblox.com/v2/assets/batch", {
        method: "POST",
        headers: {
            "User-Agent": "Roblox/WinInet",
            "Content-Type": "application/json",
            "Cookie": `.ROBLOSECURITY=${await getCookie()}`,
            "Roblox-Place-Id": placeId,
            "Accept": "*/*",
            "Roblox-Browser-Asset-Request": "false",
        },
        body: JSON.stringify([{
            assetId,
            assetType, // "Audio"
            requestId: "0",
        }]),
    })
        .then(response => response.json());
}

function createDropdown(name) {
    const container = document.createElement('div');
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    const ul = document.createElement('ul');

    checkbox.type = 'checkbox';
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(name));
    container.appendChild(label);
    container.appendChild(ul);

    container.newItem = function (element) {
        const li = document.createElement('li');
        li.appendChild(element);
        ul.appendChild(li);
    };

    return container;
}

// Assets category
const Assets = createDropdown("Assets");

// Items
const downloadAsset = document.createElement("input");
downloadAsset.type = "text";
downloadAsset.placeholder = "Insert asset ID and hit enter";

downloadAsset.addEventListener("keypress", async (input) => {
    if (input.key === "Enter") {
        const assetId = input.target?.value;
        let downloadUrl = "https://assetdelivery.roblox.com/v1/asset/?id=" + assetId; // roproxy
        const details = await getDetails(assetId);
        let name = details.Name;

        if (assetType[details.AssetTypeId] === "Audio" && !details.IsPublicDomain) {
            let fetched = await fetchAsset(assetId, prompt("Since this asset is a private audio, you have to include the ID of the Place it is from."));
            alert(JSON.stringify(fetched));
            downloadUrl = fetched[0].locations[0].location;
        }

        const buffer = await fetch(downloadUrl).then(response => response.arrayBuffer());
        download(buffer, name, details);
    }
});

Assets.newItem(downloadAsset);
//

// Miscellaneous category
const Miscellaneous = createDropdown("Miscellaneous");

// Items
const copyButton = document.createElement("button");
copyButton.textContent = "Copy .ROBLOSECURITY";

copyButton.addEventListener("click", async () => {
    const cookie = await getCookie();
    navigator.clipboard.writeText(cookie);
});

const setButton = document.createElement("input");
setButton.type = "text";
setButton.placeholder = "Insert cookie and hit enter";

setButton.addEventListener("keypress", async (input) => {
    if (input.key === "Enter") {
        const cookie = input.target?.value;

        await setCookie({
            url: "https://www.roblox.com", // tab.url,
            domain: "roblox.com",
            name: ".ROBLOSECURITY",
            value: cookie,
            expirationDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // Set expiration time to 7 days
            path: '/',
            secure: true,
            httpOnly: true
        });


        // Reload all ROBLOX tabs
        chrome.tabs.query({ url: "*://*.roblox.com/*" }, (tabs) => {
            tabs.forEach(tab => {
                console.log(tab.url);
            });
        });
    }
});

Miscellaneous.newItem(copyButton);
Miscellaneous.newItem(setButton);
//

document.body.appendChild(Assets);
document.body.appendChild(Miscellaneous);
