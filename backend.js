chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
	const { action, ...arguments } = request;

	switch (action) {
		case "getCookie": {
			chrome.cookies.get(arguments, sendResponse);
			return true;
		}

		case "setCookie": {
			chrome.cookies.set(arguments, sendResponse);
			return true;
		}
	}
});
