chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
	const { action, ...args } = request; // arguments

	switch (action) {
		case "getCookie": {
			chrome.cookies.get(args, sendResponse);
			return true;
		};

		case "setCookie": {
			chrome.cookies.set(args, sendResponse);
			return true;
		};
	};
});

chrome.action.onClicked.addListener(() => {
	chrome.tabs.create({
		url: chrome.runtime.getURL("index.html")
	});
});
