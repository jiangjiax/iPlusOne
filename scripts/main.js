class Main {
    constructor() {
        this.checkUserStatus();
        // this.addDebugPanel();
        this.initStartButton();
    }

    initStartButton() {
        const startBtn = document.querySelector('.start-btn');
        if (!startBtn) return;

        startBtn.addEventListener('click', async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                
                if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
                    alert('此页面不支持内容分析。\n请在正常的网页上使用此功能。');
                    return;
                }

                // 使用与右键菜单相同的代码
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['scripts/content.js'],
                });

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: async () => {
                        if (!window.contentAnalyzer) {
                            window.contentAnalyzer = new window.ContentAnalyzer();
                        }
                        const analyzer = window.contentAnalyzer;
                        await analyzer.initialize();
                        
                        const existingPanel = document.querySelector('.english-i-plus-one-panel');
                        if (existingPanel) {
                            analyzer.clearHighlights();
                            existingPanel.remove();
                        }
                        
                        const stats = analyzer.processPage();
                        analyzer.showResults(stats);
                    }
                });
                
                window.close();
            } catch (error) {
                console.error('Error:', error);
                alert('无法在此页面执行分析。\n请在正常的网页上使用此功能。');
            }
        });
    }

    async checkUserStatus() {
        try {
            // 检查是否完成引导
            const result = await chrome.storage.local.get(['isOnboardingComplete', 'knownWords', 'userLevel']);
            
            // 如果未完成引导，重定向到引导页面
            if (!result.isOnboardingComplete) {
                window.location.href = 'onboarding.html';
                return;
            }
            
            // 打印存储的数据（用于调试）
            console.log('存储的数据:', {
                level: result.userLevel,
                knownWordsCount: result.knownWords ? Object.keys(result.knownWords).length : 0,
                isComplete: result.isOnboardingComplete
            });

            // 获取统计数据并更新UI
            this.updateStats();
            
        } catch (error) {
            console.error('Error checking user status:', error);
        }
    }

    async updateStats() {
        try {
            // 获取统计数据
            const result = await chrome.storage.local.get(['knownWords', 'learningWords', 'dailyArticles', 'lastArticleDate']);
            
            // 检查日期，如果日期不同则重置 Map
            const today = new Date().toISOString().split('T')[0];
            let dailyArticles = result.dailyArticles || {};
            if (typeof dailyArticles !== 'object' || Array.isArray(dailyArticles)) {
                dailyArticles = {}; // 如果 dailyArticles 不是对象，重置为空对象
            }
            if (result.lastArticleDate !== today) {
                dailyArticles = {};
                await chrome.storage.local.set({
                    dailyArticles: {},
                    lastArticleDate: today
                });
            }

            // 计算已阅读文章数
            const dailyArticlesCount = Object.keys(dailyArticles).length;

            // 计算已掌握单词数
            const knownWordsCount = result.knownWords ? Object.keys(result.knownWords).length : 0;
            
            // 计算学习中单词数
            const learningWordsCount = result.learningWords ? Object.keys(result.learningWords).length : 0;

            // 更新UI
            document.querySelector('.stats-item:nth-child(1) .stats-value').textContent = dailyArticlesCount;
            document.querySelector('.stats-item:nth-child(2) .stats-value').textContent = knownWordsCount;
            document.querySelector('.stats-item:nth-child(3) .stats-value').textContent = learningWordsCount;

        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    addDebugPanel() {
        // 创建调试面板容器
        const debugPanel = document.createElement('div');
        Object.assign(debugPanel.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '10px',
            borderRadius: '8px',
            display: 'none',
            zIndex: 9999
        });

        // 添加标题
        const title = document.createElement('div');
        title.textContent = 'Debug Panel';
        Object.assign(title.style, {
            color: '#fff',
            marginBottom: '8px',
            fontSize: '12px',
            fontWeight: 'bold'
        });
        debugPanel.appendChild(title);

        // 添加按钮容器
        const buttonContainer = document.createElement('div');
        Object.assign(buttonContainer.style, {
            display: 'flex',
            gap: '8px'
        });
        debugPanel.appendChild(buttonContainer);

        // 查看数据按钮
        const viewBtn = this.createDebugButton('查看数据');
        viewBtn.addEventListener('click', async () => {
            const data = await chrome.storage.local.get(null);
            console.log('存储的数据:', data);
            alert(JSON.stringify(data, null, 2));
        });
        buttonContainer.appendChild(viewBtn);

        // 清空数据按钮
        const clearBtn = this.createDebugButton('清空数据');
        clearBtn.addEventListener('click', async () => {
            if (confirm('确定要清空所有存储的数据吗？这将重置插件状态。')) {
                await chrome.storage.local.clear();
                console.log('数据已清空');
                alert('数据已清空，插件将重新加载');
                window.location.reload();
            }
        });
        buttonContainer.appendChild(clearBtn);

        // 添加切换按钮
        const toggleBtn = document.createElement('button');
        Object.assign(toggleBtn.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(0, 0, 0, 0.5)',
            color: '#fff',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            opacity: '0.3'
        });
        toggleBtn.textContent = 'Debug';
        toggleBtn.addEventListener('click', () => {
            debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
        });
        toggleBtn.addEventListener('mouseenter', () => {
            toggleBtn.style.opacity = '1';
        });
        toggleBtn.addEventListener('mouseleave', () => {
            toggleBtn.style.opacity = '0.3';
        });

        // 添加到页面
        document.body.appendChild(debugPanel);
        document.body.appendChild(toggleBtn);
    }

    createDebugButton(text) {
        const button = document.createElement('button');
        Object.assign(button.style, {
            background: '#2563EB',
            color: '#fff',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
        });
        button.textContent = text;
        return button;
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new Main();

    // 获取所有导航链接
    const navLinks = document.querySelectorAll('.nav-item');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // 阻止默认行为
            e.preventDefault();
            
            const href = link.getAttribute('href');
            if (href && href !== '#') {
                // 打开新标签页
                chrome.tabs.create({
                    url: chrome.runtime.getURL(`pages/${href}`)
                });
                
                // 关闭弹出窗口
                window.close();
            }
        });
    });
});

// 在扩展弹出窗口关闭时移除面板
window.addEventListener('unload', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: () => {
                    if (window.contentAnalyzer) {
                        window.contentAnalyzer.removePanel();
                    }
                }
            });
        }
    });
}); 