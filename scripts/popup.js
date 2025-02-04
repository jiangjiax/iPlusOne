document.getElementById('openWelcome').addEventListener('click', () => {
    // 在新标签页中打开欢迎页面
    chrome.tabs.create({
        url: 'pages/welcome.html'
    });
    // 关闭弹出窗口
    window.close();
}); 