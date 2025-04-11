chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "getCookie": {
			chrome.cookies.get({
				url: request.url,
				name: request.name
			}, sendResponse);

			return true;
        }

        case "setCookie": {
            chrome.cookies.set(request.arguments, sendResponse);
			      return true;
        }
    }
});
