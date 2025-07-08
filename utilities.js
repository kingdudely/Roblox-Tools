const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// null
async function fetchApi(category, api, method = "GET", body, headers = { "Content-Type": "application/json" }) {
	return (await fetch(`https://${category}.roblox.com${api}`, {
				method,
				headers,
				body: JSON.stringify(body ?? undefined),
			})).json();
};

function setParams(params, object) {
	for (const [key, value] of Object.entries(object)) {
		if (key != null && value != null) {
			params.set(key, value);
		};
	};
};

// const setDefault = (object, defaultObject) => ({ ...defaultObject, ...object });

export function sanitize(name) {
	let encoded = textEncoder.encode(name).slice(0, 255); // 255 byte limit for Linux
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

export function getFileType(buffer, info) { // details, data
	try {
		// Check if buffer is JSON
		JSON.parse(textDecoder.decode(buffer));
		return ["json", "application/json"];
	} catch {
		// let result = ["txt", "text/plain"]
		const data = new Uint8Array(buffer);
		const isRobloxPlace = +(info?.assetTypeId) === 9; // Place
		
		const extensions = [
			[[137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82], "png", "image/png"],
			[[255, 216, 255], "jpg", "image/jpg"], // [0xFF, 0xD8, 0xFF]
			[[79, 103, 103, 83], "ogg", "audio/ogg"], // [0x4F, 0x67, 0x67, 0x53]
			[[0, 1, 0, 0, 0], "ttf", "font/ttf"],
			[[60, 114, 111, 98, 108, 111, 120, 33], isRobloxPlace ? "rbxl" : "rbxm", "application/octet-stream"],
			[[60, 114, 111, 98, 108, 111, 120], isRobloxPlace ? "rbxlx" : "rbxmx", "application/xml"]
		];
		
		for (const [signature, extension, mime] of extensions) { // MIME-type
			if (signature.every((byte, index) => +byte === +data[index])) {
				return [extension, mime];
			};
		};
	
		// return ["txt", "text/plain"];
		return ["", "application/octet-stream"];
	};
};

export function download(buffer, filename, info) {
	filename = sanitize(filename);
	
	// Filename and extension
	let [extension, type] = getFileType(buffer, info);
	extension = "." + extension;
	
	if (!filename.endsWith(extension)) {
		filename += extension;
	};
	
	// Download
	const blob = new Blob([buffer], { type });
	
	// Link that downloads the file when clicked
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	link.click();
	
	URL.revokeObjectURL(link.href);
};

// https://rdd.latte.to/
export async function getVersionInfo() {
	return fetchApi("clientsettings", "/v2/client-version/WindowsStudio64/");
};

export async function getStudioFile(filename) {
	const versionInfo = await getVersionInfo();
	const versionHash = versionInfo?.clientVersionUpload;

	if (versionHash != null) {
		const buffer = await (await fetch(`https://setup-aws.rbxcdn.com/${versionHash}-${filename}`)).arrayBuffer();

		let [extension, type] = getFileType(buffer);
		extension = "." + extension;
		
		if (!filename.endsWith(extension)) {
			filename += extension;
		};

		return new File([buffer], filename, { type });
	};
};

export async function getUserInfo(forceLogin = true) {
	const info = await fetchApi("users", "/v1/users/authenticated");

	if (forceLogin && info?.errors != null) {
		alert("Please log into a valid ROBLOX account.");
		window.open("https://www.roblox.com/login", "_blank");
	};

	return info;
};

export async function getAssetInfo(id) {
	return fetchApi("economy", `/v2/assets/${id}/details`);
};

export async function getUniversesByUser(settings = {}) {
	settings = Object.assign({
		userId: null,
		isArchived: false,
		limit: 50, // 10, 25, 50, 100 Only for first
		cursor: null,
		sortOrder: "Asc", // Desc
		accessFilter: "Public",
	}, settings);

	let url;
	const { userId } = settings;

	if (userId == null) {
		url = new URL("https://develop.roblox.com/v1/user/universes");
	} else {
		url = new URL(`https://games.roblox.com/v2/users/${userId}/games`);
	};

	setParams(url.searchParams, settings);
	
	return (await fetch(url)).json();
};

export async function getAllUniverseInfo(settings = {}) {
	settings = Object.assign({
		universeIds: [],
	}, settings);

	const url = new URL("https://games.roblox.com/v1/games");
	setParams(url.searchParams, settings);

	return (await fetch(url)).json();
};

/*
GET https://apis.roblox.com/universes/v1/search
BODY
{
	CreatorType: "User",
	CreatorTargetId: null,
	IsArchived: false,
	PageSize: 25,
	SortParam: "LastUpdated",
	SortOrder: "Desc",
}
*/

export async function getPlaceIcons(settings = {}) {
	settings = Object.assign({
		placeIds: [],
		returnPolicy: "PlaceHolder", // AutoGenerated
		size: "512x512", // 150x150, 50x50
		format: "webp", // Png, Jpeg
		// isCircular: false, Ain't even work
	}, settings);

	const url = new URL("https://thumbnails.roblox.com/v1/places/gameicons");
	setParams(url.searchParams, settings);

	return (await fetch(url)).json();
};

export async function getUniverseIcons(settings = {}) {
	settings = Object.assign({
		universeIds: [],
		returnPolicy: "AutoGenerated", // PlaceHolder
		size: "512x512", // 150x150, 50x50
		format: "webp", // Png, Jpeg
		// isCircular: false, Doesn't work either
	}, settings);

	const url = new URL("https://thumbnails.roblox.com/v1/games/icons");
	setParams(url.searchParams, settings);

	return (await fetch(url)).json();
};

export async function getAPIDump() {
	return (await fetch("https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/Full-API-Dump.json")).json();
};

export function getCookie(url = "https://www.roblox.com", name = ".ROBLOSECURITY") {
	return new Promise(function (resolve) {
		chrome.runtime.sendMessage({
			action: "getCookie",
			url,
			name
		}, cookie => resolve(cookie?.value));
	});
};

export function setCookie(options) {
	return new Promise(function (resolve) {
		chrome.runtime.sendMessage({
			action: "setCookie",
			...options
		}, resolve);
	});
};

export async function fetchAsset(assetId, placeId, assetType = "Audio") { // Only for audios right now
	return fetchApi("assetdelivery", "/v2/assets/batch", "POST", [{
				assetId,
				assetType,
				requestId: "0",
			}], {
				"User-Agent": "Roblox/WinInet",
				"Content-Type": "application/json",
				"Cookie": ".ROBLOSECURITY=" + await getCookie(),
				"Roblox-Place-Id": placeId,
				"Accept": "*/*",
				"Roblox-Browser-Asset-Request": "false",
			});
};

export async function login(cookie) {
	await setCookie({
		url: "https://www.roblox.com",
		domain: "roblox.com",
		name: ".ROBLOSECURITY",
		value: cookie,
		expirationDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // Set expiration time to 7 days
		path: '/',
		secure: true,
		httpOnly: true
	});
	
	// Reload all ROBLOX tabs
	chrome.tabs.query({ url: "*://*.roblox.com/*" }, function (tabs) {
		for (const tab of tabs) {
			chrome.tabs.reload(tab?.id);
		};
	});
};

/*
export function createLoadingGui(amount = 3) {
	const blue = "#0074bd";
	const duration = 2.5;
	const keyframes = [
		{
			offset: 0,
			transform: 'scaleY(1)',
			backgroundColor: 'white',
		},
		{
			offset: 1 / 3, // 0.3333
			transform: 'scaleY(1.25)',
			backgroundColor: blue,
		},
		{
			offset: ((1 / 3) / 3) + (1 / 3), // 0.4444
			transform: 'scaleY(1)',
			backgroundColor: 'white',
		}
	];

	const container = document.createElement("div");
	Object.assign(container.style, {
		display: "flex",
		gap: "30px",
	});

	for (let nth = 1; nth <= amount; nth++) {
		const cube = document.createElement("div");
		Object.assign(cube.style, {
			width: "20px",
			aspectRatio: "1 / 1",
			backgroundColor: "white",
			// animation: `loading ${duration}s ease-in-out infinite`;
			// animation-delay: duration / (amount / (nth - 1)) + "s";
			transformOrigin: "center",
		});

		cube.animate(keyframes, {
			duration, // s
			iterations: Infinity, // loop forever
			delay: duration / (amount / (nth - 1)) // s
		});

		container.appendChild(cube);
	};

	return container;
};
*/
