import {
	getUserInfo,
	getAssetInfo,
	fetchAsset,
	download,
	getCookie,
	login,
} from "/modules/utilities.js";
	

document.getElementById("downloadAsset")?.addEventListener("keypress", async function (event) {
	if (event.key === "Enter") {
		await getUserInfo();
		
		const assetId = event.target?.value;

		if (assetId != null) {
			const info = await getAssetInfo(assetId);
			const filename = info.Name;

			let downloadUrl = "https://assetdelivery.roblox.com/v1/asset/?id=" + assetId;

			// Private Audio
			if (+info.AssetTypeId === 3 && ["false", false].includes(info.IsPublicDomain)) {
				const placeId = prompt("Since this asset is a private audio, you have to include the ID of the Place it is from.");
				const fetched = await fetchAsset(assetId, placeId);
				
				downloadUrl = fetched[0].locations[0].location;
			};

			const buffer = await (await fetch(downloadUrl)).arrayBuffer();
			download(buffer, filename, info);
		};
	};
});

document.getElementById("copyCookie")?.addEventListener("click", async function () {
	const cookie = await getCookie();
	navigator.clipboard.writeText(cookie);
});

document.getElementById("setCookie")?.addEventListener("keypress", async function (event) {
	if (event.key === "Enter") {
		const cookie = event.target?.value;

		if (cookie != null) {
			login(cookie);
		};
	}
});

document.getElementById("openStudio")?.addEventListener("click", async function () {
	window.open(chrome.runtime.getURL("studio/index.html"), "_blank");
});
