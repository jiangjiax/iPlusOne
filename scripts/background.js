// 监听来自 content script 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'fetchWord') {
        // 使用 fetch API 获取词典数据
        fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(request.word)}`)
            .then(response => response.json())
            .then(data => {
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error('Error fetching word data:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // 保持消息通道打开
    }
});

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'iPlusOneAnalyze',
        title: '使用 iPlusOne 分析页面',
        contexts: ['page']
    });
});

// 监听菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'iPlusOneAnalyze') {
        // 检查是否是扩展内部页面
        if (tab.url.startsWith('chrome-extension://')) {
            return; // 不处理扩展内部页面
        }

        // 检查是否有权限访问页面
        chrome.permissions.contains({
            permissions: ['activeTab'],
            origins: [tab.url]
        }, (hasPermission) => {
            if (hasPermission) {
                // 注入内容脚本
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['scripts/content.js']
                }).then(() => {
                    // 执行分析
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        function: async () => {
                            if (!window.contentAnalyzer) {
                                window.contentAnalyzer = new window.ContentAnalyzer();
                            }
                            const analyzer = window.contentAnalyzer;
                            await analyzer.initialize();
                            
                            // 移除现有面板
                            const existingPanel = document.querySelector('.english-i-plus-one-panel');
                            if (existingPanel) {
                                analyzer.clearHighlights();
                                existingPanel.remove();
                            }
                            
                            // 直接显示加载状态，并等待分析结果
                            const statsPromise = analyzer.processPage();
                            analyzer.showResults(statsPromise);
                        }
                    });
                }).catch(error => {
                    console.error('Failed to inject content script:', error);
                });
            } else {
                // 请求权限
                chrome.permissions.request({
                    permissions: ['activeTab'],
                    origins: [tab.url]
                }, (granted) => {
                    if (granted) {
                        // 重新触发点击事件
                        chrome.contextMenus.update('iPlusOneAnalyze', {}, () => {
                            chrome.contextMenus.onClicked.dispatch(info, tab);
                        });
                    }
                });
            }
        });
    }
});

// 监听标签页更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // 检查是否是扩展内部页面
    if (tab.url && tab.url.startsWith('chrome-extension://')) {
        return; // 不处理扩展内部页面
    }

    if (changeInfo.status === 'loading') {
        // 页面开始加载时，移除内容脚本
        chrome.scripting.executeScript({
            target: { tabId: tabId },
            function: () => {
                if (window.contentAnalyzer) {
                    window.contentAnalyzer.removePanel();
                }
            }
        }).catch(error => {
            // 忽略对扩展页面的注入错误
            console.debug('Skipping content script injection for extension page');
        });
    }
}); 