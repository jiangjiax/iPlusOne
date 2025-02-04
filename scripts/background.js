// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'fetchWord') {
        fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(request.word)}`)
            .then(response => response.json())
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        return true; // 保持消息通道打开
    }
}); 