const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

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
    // 255 byte limit for Linux/Unix and 255 character for Windows
    let encoded = textEncoder.encode(name).slice(0, 255)
    name = textDecoder.decode(encoded);

    return name
        .replace(/\uFFFD/g, '') // Characters that were bugged after trim
        .replace(/^\.+$/, '') // . and .. are reserved by Unix
        .replace(/[\. ]+$/, '') // Illegal trailing periods/spaces in Windows
        .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i) // Reserved Windows file names
        .replace(/\s+/g, '_') // Remove spaces for more compatibility
        .replace(/[^a-zA-Z0-9._-]/g, '') // Only allow alphanumeric characters (including _ - .)
}


async function getDetails(id) {
    return fetch(`https://economy.roproxy.com/v2/assets/${id}/details`).then(response => response.json());
};

function getCookie() {
    return new Promise((resolve, reject) => {
        chrome.cookies.get({ url: "https://www.roblox.com", name: ".ROBLOSECURITY" }, (cookie) => {
            if (cookie) 
                resolve(cookie.value); 
            else 
                reject("Cookie not found");
        });
    });
}

function download(url, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url, // url: url
            filename: sanitize(filename)
        }, (id) => {
            if (id)
                resolve(id)
            else
                reject("Download failed")
        });
    });
};

function getFileExtension(buffer, details) {
    const isPlace = assetType[details.AssetTypeId] === "Place";

    const extensions = [
        [[137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82], "png"],
        [[0xFF, 0xD8, 0xFF], "jpg"],
        [[0x4F, 0x67, 0x67, 0x53], "ogg"],
        [[0, 1, 0, 0, 0], "ttf"],
        [[60, 114, 111, 98, 108, 111, 120, 33], isPlace ? "rbxl" : "rbxm"],
        [[60, 114, 111, 98, 108, 111, 120], isPlace ? "rbxlx" : "rbxmx"]
    ];

    const data = new Uint8Array(buffer);

    for (let [signature, extension] of extensions) {
        if (signature.every((byte, index) => byte === data[index])) {
            return extension;
        }
    }
    
    return "";
};

async function fetchAsset(assetId, placeId) {
    return fetch("https://fetch-asset.glitch.me/v1", { // It didn't work if I used the API here
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
            asset: assetId, 
            place: placeId, 
            cookie: await getCookie() 
        })
    }).then(response => response.json());
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

downloadAsset.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const assetId = e.target?.value;
        let downloadUrl = "https://assetdelivery.roproxy.com/v1/asset/?id=" + assetId;
        const details = await getDetails(assetId);
        let name = details.Name;

        if (assetType[details.AssetTypeId] === "Audio" && !details.IsPublicDomain) {
            let fetched = await fetchAsset(assetId, prompt("Since this asset is a private audio, you have to include the ID of the Place it is from."));
            alert(JSON.stringify(fetched))
            downloadUrl = fetched[0].locations[0].location;
        }

        const buffer = await fetch(downloadUrl).then(response => response.arrayBuffer());
        const extension = "." + getFileExtension(buffer, details);

        if (!name.endsWith(extension)) {
            name += extension;
        }

        download(downloadUrl, name);
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

setButton.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
        const cookie = e.target?.value;
        const [tab] = await chrome.tabs.query({ active: true });
        
        const date = new Date();
        date.setTime(date.getTime() + 7 * 24 * 60 * 60 * 1000); // Set expiration time to 7 days

        await chrome.cookies.set({
            url: tab.url,
            domain: "roblox.com",
            name: ".ROBLOSECURITY",
            value: cookie,
            expirationDate: date.getTime(),
            path: '/',
            secure: true,
            httpOnly: true
        });

        chrome.tabs.reload();
    }
});

Miscellaneous.newItem(copyButton);
Miscellaneous.newItem(setButton);
//

document.body.appendChild(Assets);
document.body.appendChild(Miscellaneous);