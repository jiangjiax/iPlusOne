if (!window.ContentAnalyzer) {  // 只在首次加载时定义类
    window.ContentAnalyzer = class {
        constructor() {
            this.knownWords = null;
            this.learningWords = null;  // 新增：学习中的单词
            this.pageWords = new Set();
            this.newWords = new Set();
            // 记录单词出现次数
            this.wordFrequency = new Map();
            this.template = null;
            this.styles = null;
            this.tooltipTemplate = null;
            this.appKey = 'your_app_key';
            this.appSecret = 'your_app_secret';
            this.initNavigationListener();
        }

        // 初始化，获取已知词汇
        async initialize() {
            // 加载模板和样式
            await Promise.all([
                this.loadTemplate(),
                this.loadStyles(),
                this.loadTooltipTemplate()
            ]);
            // 加载已知词汇
            const result = await chrome.storage.local.get(['knownWords', 'learningWords']);
            this.knownWords = result.knownWords || {};
            this.learningWords = result.learningWords || {};

            // 记录文章阅读
            this.recordArticleRead();
        }

        async loadTemplate() {
            const url = chrome.runtime.getURL('templates/panel.html');
            const response = await fetch(url);
            this.template = await response.text();
        }

        async loadStyles() {
            const url = chrome.runtime.getURL('styles/panel.css');
            const response = await fetch(url);
            this.styles = await response.text();
        }

        async loadTooltipTemplate() {
            const url = chrome.runtime.getURL('templates/tooltip.html');
            const response = await fetch(url);
            this.tooltipTemplate = await response.text();
        }

        async recordArticleRead() {
            // 获取今天的日期
            const today = new Date().toISOString().split('T')[0];
            
            // 获取存储的阅读记录
            const result = await chrome.storage.local.get(['dailyArticles', 'lastArticleDate']);
            
            // 初始化 dailyArticles 为 Map
            let dailyArticles = result.dailyArticles || {};
            if (typeof dailyArticles !== 'object' || Array.isArray(dailyArticles)) {
                dailyArticles = {}; // 如果 dailyArticles 不是对象，重置为空对象
            }
            
            // 如果日期不同（新的一天），重置 Map
            if (result.lastArticleDate && result.lastArticleDate !== today) {
                dailyArticles = {};
            }

            // 获取当前页面的 URL
            const url = window.location.href;
            
            // 如果文章还未记录过，则添加到 Map
            if (!dailyArticles[url]) {
                dailyArticles[url] = new Date().toISOString();
            }

            // 更新阅读记录
            await chrome.storage.local.set({
                dailyArticles: dailyArticles,
                lastArticleDate: today
            });
        }

        // 遍历所有文本节点，直接处理每个文本节点
        async processPage() {
            // 等待页面完全加载
            await this.waitForPageLoad();

            // 重置统计
            this.pageWords = new Set();
            this.newWords = new Set();
            this.wordFrequency = new Map();

            // 获取所有文本节点
            const textNodes = this.getAllTextNodes(document.body);
            
            // 处理每个文本节点
            textNodes.forEach(node => {
                const text = node.textContent.trim();
                if (this.isValidEnglishText(text)) {
                    this.processTextNode(node, text);
                }
            });

            // 返回统计数据
            return this.generateStats();
        }

        waitForPageLoad() {
            return new Promise((resolve) => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', () => resolve());
                }
            });
        }

        // 获取所有文本节点
        getAllTextNodes(root) {
            const textNodes = [];
            const walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // 检查父元素
                        const parent = node.parentElement;
                        if (!parent) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // 跳过隐藏元素
                        if (!this.isNodeVisible(node)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // 跳过这些标签
                        const skipTags = [
                            'SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA',  // 代码相关
                            'BUTTON', 'INPUT', 'SELECT',              // 交互元素，移除了 'A'
                            'NAV', 'HEADER', 'FOOTER',                     // 导航和页眉页脚
                            'TIME', 'META', 'IMG', 'SVG',                 // 媒体和元数据
                            'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO',          // 嵌入内容
                            'nav', 'navigation',     // 导航
                            'header', 'footer',   // 页面结构
                            'ad', 'ads', 'advertisement',    // 广告
                            'social', 'share',              // 社交分享
                            'meta', 'metadata',             // 元数据
                            'tag', 'tags', 'category',      // 标签和分类
                            'related', 'recommendation'      // 相关内容
                        ];
                        if (skipTags.includes(parent.tagName)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        // 检查是否是正文内容
                        const isContent = this.isContentNode(parent);
                        if (!isContent) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        console.log("node:", node.textContent.trim());

                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

            let node;
            while (node = walker.nextNode()) {
                // node文本内容只有空格和换行的话，跳过
                if (node.textContent.trim().length == 0) {
                    continue
                }
                textNodes.push(node);
            }
            return textNodes;
        }

        // 检查节点是否可见
        isNodeVisible(node) {
            const element = node.parentElement;
            if (!element) return false;

            const style = window.getComputedStyle(element);
            return style.display !== 'none' && 
                   style.visibility !== 'hidden' && 
                   style.opacity !== '0' &&
                   element.offsetHeight > 0;
        }

        // 检查文本是否包含有效的英文内容
        isValidEnglishText(text) {
            // 至少包含一个完整的英文单词
            return text.length > 0 && /[a-zA-Z]{2,}/.test(text);
        }

        // 处理单个文本节点
        processTextNode(node, text) {
            const wordPattern = /(\b[a-zA-Z]+(?:[-'.][a-zA-Z]+)*\b|\s+|[^a-zA-Z\s]+)/g;
            const parts = text.split(wordPattern);
            
            // 创建新的包装元素
            const wrapper = document.createElement('span');
            wrapper.className = 'i-plus-one-text';
            
            parts.forEach(part => {
                if (!part) return;
                
                const word = part.toLowerCase();
                if (/^[a-zA-Z]+(?:[-'.][a-zA-Z]+)*$/.test(word)) {
                    const span = document.createElement('span');
                    span.textContent = part;
                    
                    // 更新统计
                    this.pageWords.add(word);
                    this.wordFrequency.set(word, (this.wordFrequency.get(word) || 0) + 1);
                    
                    if (this.knownWords[word]) {
                        span.className = 'i-plus-one-known';
                    } else {
                        span.className = 'i-plus-one-new';
                        this.newWords.add(word);
                    }
                    
                    // 添加悬停和点击事件
                    let hoverTimeout;
                    span.addEventListener('mouseenter', (e) => {
                        hoverTimeout = setTimeout(() => {
                            this.showWordTooltip(e, word, false);
                        }, 300); // 添加300ms延迟，避免鼠标快速划过时显示
                    });
                    
                    span.addEventListener('mouseleave', (e) => {
                        clearTimeout(hoverTimeout);
                        const tooltip = document.getElementById('i-plus-one-tooltip');
                        if (tooltip && !tooltip.classList.contains('pinned')) {
                            this.hideWordTooltip();
                        }
                    });
                    
                    span.addEventListener('click', (e) => {
                        e.stopPropagation();
                        clearTimeout(hoverTimeout);
                        this.showWordTooltip(e, word, true); // true表示固定显示
                    });
                    
                    wrapper.appendChild(span);
                } else {
                    wrapper.appendChild(document.createTextNode(part));
                }
            });
            
            node.parentNode.replaceChild(wrapper, node);
            node._processed = true;
        }

        // 添加 hideWordTooltip 方法
        hideWordTooltip() {
            const tooltip = document.getElementById('i-plus-one-tooltip');
            if (tooltip) {
                // 移除document的点击事件监听
                if (this.handleDocumentClick) {
                    document.removeEventListener('click', this.handleDocumentClick);
                    this.handleDocumentClick = null;
                }
                tooltip.remove();
            }
        }

        // 生成签名
        generateSign(input, salt) {
            const md5 = require('crypto-js/md5');
            const str = this.appKey + input + salt + this.appSecret;
            return md5(str).toString();
        }

        // 更新按钮样式的工具方法
        updateMasteryButtonStyle(button, isKnown) {
            const styles = isKnown ? {
                background: 'rgba(34, 197, 94, 0.15)',
                borderColor: 'rgba(34, 197, 94, 0.3)',
                color: '#22C55E'
            } : {
                background: 'rgba(239, 68, 68, 0.05)',
                borderColor: 'rgba(239, 68, 68, 0.2)',
                color: '#EF4444'
            };

            Object.assign(button.style, styles);
            button.classList.toggle('active', isKnown);

            // 更新图标和文本
            const actionIcon = button.querySelector('.action-icon');
            actionIcon.textContent = isKnown ? '✓' : '×';
            actionIcon.style.color = isKnown ? '#22C55E' : '#EF4444';  // 设置图标颜色

            button.querySelector('.btn-text').textContent = isKnown ? '已掌握' : '未掌握';
        }

        // 更新按钮样式的工具方法
        updateStarButtonStyle(button, isLearning) {
            const styles = isLearning ? {
                background: 'rgba(234, 179, 8, 0.15)',
                borderColor: 'rgba(234, 179, 8, 0.3)',
                color: '#EAB308'
            } : {
                background: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
                color: '#9CA3AF'
            };

            Object.assign(button.style, styles);
            button.classList.toggle('active', isLearning);
            
            // 更新星星图标颜色
            const starIcon = button.querySelector('.star-icon');
            starIcon.style.fill = isLearning ? '#EAB308' : '#9CA3AF';
        }

        // 初始化按钮状态
        initializeButtons(tooltip, word) {
            const masteryBtn = tooltip.querySelector('.mastery-btn');
            const starBtn = tooltip.querySelector('.star-btn');
            
            const isKnown = this.knownWords[word];
            const isLearning = this.learningWords[word];  // 从本地存储中获取学习状态

            // 设置初始状态
            this.updateMasteryButtonStyle(masteryBtn, isKnown);
            this.updateStarButtonStyle(starBtn, isLearning);  // 根据实际状态设置样式

            // 添加点击事件
            masteryBtn.addEventListener('click', () => {
                const newStatus = !this.knownWords[word];
                this.updateWordStatus(word, newStatus ? 'known' : 'unknown');
                this.updateMasteryButtonStyle(masteryBtn, newStatus);
            });

            starBtn.addEventListener('click', () => {
                const newStatus = !this.learningWords[word];
                if (newStatus) {
                    // 添加到学习中状态
                    this.learningWords[word] = true;
                } else {
                    // 从学习中状态移除
                    delete this.learningWords[word];
                }
                
                // 保存到本地存储
                chrome.storage.local.set({
                    learningWords: this.learningWords
                });
                
                // 更新按钮样式
                this.updateStarButtonStyle(starBtn, newStatus);
            });
        }

        // 添加显示词义工具提示的方法
        async showWordTooltip(event, word, isPinned = false) {
            event.stopPropagation();
            
            // 移除可能存在的其他提示框
            const existingTooltip = document.getElementById('i-plus-one-tooltip');
            if (existingTooltip) {
                existingTooltip.remove();
            }

            // 创建新的提示框
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = this.tooltipTemplate;
            const tooltip = tempDiv.firstElementChild;
            
            if (isPinned) {
                tooltip.classList.add('pinned');
            }

            // 添加关闭按钮事件
            const closeBtn = tooltip.querySelector('.close-btn');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hideWordTooltip();
            });

            // 添加tooltip的鼠标进入和离开事件
            tooltip.addEventListener('mouseenter', () => {
                clearTimeout(this.tooltipHideTimeout);
            });

            tooltip.addEventListener('mouseleave', (e) => {
                if (!tooltip.classList.contains('pinned')) {
                    this.hideWordTooltip();
                }
            });

            // 添加点击其他区域关闭事件（仅当固定显示时）
            if (isPinned) {
                document.addEventListener('click', this.handleDocumentClick = (e) => {
                    if (!tooltip.contains(e.target) && e.target.textContent.toLowerCase() !== word) {
                        this.hideWordTooltip();
                    }
                });
            }

            // 定位工具提示
            const rect = event.target.getBoundingClientRect();
            tooltip.style.left = `${rect.left}px`;
            tooltip.style.top = `${rect.bottom + 5}px`;
            tooltip.style.display = 'block';

            // 显示加载状态
            tooltip.querySelector('.tooltip-loading').style.display = 'block';
            tooltip.querySelector('.tooltip-content').style.display = 'none';
            tooltip.querySelector('.tooltip-error').style.display = 'none';

            try {
                // 通过 background script 发送请求
                const response = await chrome.runtime.sendMessage({
                    type: 'fetchWord',
                    word: word
                });

                if (!response.success) {
                    throw new Error(response.error);
                }

                const data = response.data;

                // 隐藏加载状态，显示内容
                tooltip.querySelector('.tooltip-loading').style.display = 'none';
                const contentDiv = tooltip.querySelector('.tooltip-content');
                contentDiv.style.display = 'block';

                // 设置单词
                contentDiv.querySelector('.tooltip-word').textContent = word;

                // 添加音标
                const phoneticsDiv = contentDiv.querySelector('.tooltip-phonetics');
                if (data.simple?.word?.[0]) {  // 检查 simple.word 数组
                    const wordInfo = data.simple.word[0];
                    const ukPhonetic = wordInfo.ukphone;  // 英式音标
                    const usPhonetic = wordInfo.usphone;  // 美式音标

                    if (ukPhonetic || usPhonetic) {
                        phoneticsDiv.innerHTML = `
                            ${ukPhonetic ? `
                                <div class="phonetic-item">
                                    <span class="phonetic-label">UK</span>
                                    <span class="phonetic-text">/${ukPhonetic}/</span>
                                </div>
                            ` : ''}
                            ${usPhonetic && usPhonetic !== ukPhonetic ? `
                                <div class="phonetic-item">
                                    <span class="phonetic-label">US</span>
                                    <span class="phonetic-text">/${usPhonetic}/</span>
                                </div>
                            ` : ''}
                        `;
                        phoneticsDiv.style.display = 'flex';
                    } else {
                        phoneticsDiv.style.display = 'none';
                    }
                } else {
                    phoneticsDiv.style.display = 'none';
                }

                // 添加释义
                const meaningsDiv = contentDiv.querySelector('.tooltip-meanings');
                meaningsDiv.innerHTML = '';
                if (data.ec?.word[0]?.trs) {
                    data.ec.word[0].trs.forEach(tr => {
                        const meaning = tr.tr[0].l.i[0];
                        // 尝试分离词性和释义
                        const match = meaning.match(/^([a-z]+\.|[a-z]+\s&\s[a-z]+\.)\s*(.+)$/i);
                        if (match) {
                            const meaningHtml = `
                                <div class="tooltip-meaning">
                                    <span class="part-of-speech">${match[1]}</span>
                                    <span class="meaning-content">${match[2]}</span>
                                </div>
                            `;
                            meaningsDiv.insertAdjacentHTML('beforeend', meaningHtml);
                        } else {
                            const meaningHtml = `
                                <div class="tooltip-meaning">
                                    <span class="meaning-content">${meaning}</span>
                                </div>
                            `;
                            meaningsDiv.insertAdjacentHTML('beforeend', meaningHtml);
                        }
                    });
                }

                // 添加词形变化
                const formsDiv = contentDiv.querySelector('.tooltip-forms');
                if (data.ec?.word[0]?.wfs?.length > 0) {
                    const formsHtml = data.ec.word[0].wfs
                        .map(wf => `
                            <span class="form-item">
                                <span class="form-label">${wf.wf.name}</span>
                                ${wf.wf.value}
                            </span>
                        `)
                        .join('');
                    formsDiv.innerHTML = formsHtml;
                    formsDiv.style.display = 'block';
                } else {
                    formsDiv.style.display = 'none';
                }

                // 添加例句（最多显示2个）
                const examplesDiv = contentDiv.querySelector('.tooltip-examples');
                if (data.sentences?.sentences?.length > 0) {
                    const examplesHtml = data.sentences.sentences
                        .slice(0, 2)
                        .map(sentence => `
                            <div class="example-item">
                                <div class="example-en">${sentence.english}</div>
                                <div class="example-zh">${sentence.chinese}</div>
                            </div>
                        `)
                        .join('');
                    examplesDiv.innerHTML = examplesHtml;
                    examplesDiv.style.display = 'block';
                } else {
                    examplesDiv.style.display = 'none';
                }

                // 初始化按钮状态和事件
                this.initializeButtons(tooltip, word);

            } catch (error) {
                console.error('Dictionary error:', error);
                // 显示错误状态
                tooltip.querySelector('.tooltip-loading').style.display = 'none';
                const errorDiv = tooltip.querySelector('.tooltip-error');
                errorDiv.style.display = 'block';
                errorDiv.querySelector('.tooltip-word').textContent = word;
            }

            document.body.appendChild(tooltip);
            this.positionTooltip(tooltip, event);
        }

        // 添加文档点击处理方法
        handleDocumentClick = (event) => {
            const tooltip = document.getElementById('i-plus-one-tooltip');
            if (tooltip && !tooltip.contains(event.target) && !event.target.classList.contains('i-plus-one-new')) {
                tooltip.remove();
                document.removeEventListener('click', this.handleDocumentClick);
            }
        };

        // 生成统计数据
        generateStats() {
            const totalWords = this.pageWords.size;
            const knownWords = Array.from(this.pageWords).filter(word => this.knownWords[word]).length;
            const newWords = this.newWords.size;
            const knownPercentage = totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0;
            const difficulty = this.evaluateDifficulty(knownPercentage);

            return {
                totalWords,
                knownWords,
                newWords,
                knownPercentage,
                difficulty,
                isEmpty: totalWords === 0
            };
        }

        // 评估难度
        evaluateDifficulty(knownPercentage) {
            if (knownPercentage >= 95) return '简单';
            if (knownPercentage >= 90) return '适合 (i+1)';
            if (knownPercentage >= 75) return '挑战';
            if (knownPercentage >= 60) return '较难';
            return '困难';
        }

        // 显示分析结果
        async showResults(statsPromise) {
            // 先显示加载状态
            const loadingPanel = this.createLoadingPanel();
            document.body.appendChild(loadingPanel);

            try {
                // 等待统计数据
                const stats = await statsPromise;
                console.log('Resolved stats:', stats);

                // 创建实际结果面板，但先隐藏
                const panel = document.createElement('div');
                panel.className = 'english-i-plus-one-panel';
                Object.assign(panel.style, {
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    background: '#1A2B3B',
                    color: '#fff',
                    padding: '20px',
                    borderRadius: '12px',
                    width: '300px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                    zIndex: 999999,
                    fontSize: '14px',
                    transition: 'all 0.3s ease',
                    display: 'none'
                });

                // 初始化面板内容
                this.renderExpandedView(panel, stats);
                document.body.appendChild(panel);

                // 移除加载面板
                loadingPanel.remove();
                
                // 显示实际结果面板
                panel.style.display = 'block';
                this.updatePanelContent(panel, stats);
                this.makeDraggable(panel);
            } catch (error) {
                console.error('Error showing results:', error);
                loadingPanel.remove();
                alert('分析页面时出错，请重试。');
            }
        }

        createLoadingPanel() {
            const panel = document.createElement('div');
            Object.assign(panel.style, {
                position: 'fixed',
                top: '20px',
                right: '20px',
                background: '#1A2B3B',
                color: '#fff',
                padding: '20px',
                borderRadius: '12px',
                width: '300px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                zIndex: 999999,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            });

            panel.innerHTML = `
                <div class="loading-container">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">正在等待页面加载...</div>
                </div>
            `;

            // 添加加载动画样式
            const style = document.createElement('style');
            style.textContent = `
                .loading-spinner {
                    border: 3px solid rgba(255, 255, 255, 0.3);
                    border-radius: 50%;
                    border-top: 3px solid #fff;
                    width: 24px;
                    height: 24px;
                    animation: spin 1s linear infinite;
                    margin-bottom: 8px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .loading-text {
                    font-size: 14px;
                    color: rgba(255, 255, 255, 0.8);
                }
            `;
            document.head.appendChild(style);

            return panel;
        }

        // 渲染展开状态
        renderExpandedView(panel, stats) {
            // 注入样式
            if (!document.querySelector('#english-i-plus-one-styles')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'english-i-plus-one-styles';
                styleEl.textContent = this.styles;
                document.head.appendChild(styleEl);
            }
            
            // 使用模板创建内容
            panel.innerHTML = this.template;
            
            // 更新数据
            this.updatePanelContent(panel, stats);
            
            // 添加事件监听
            this.addEventListeners(panel, stats);
        }

        // 更新面板内容
        updatePanelContent(panel, stats) {
            // 确保 stats 存在
            if (!stats) {
                console.error('Stats is undefined');
                return;
            }

            // 处理空内容状态
            const expandedView = panel.querySelector('.expanded-view');
            const emptyView = panel.querySelector('.empty-view');
            if (stats.isEmpty) {
                expandedView.style.display = 'none';
                emptyView.style.display = 'block';
            } else {
                expandedView.style.display = 'block';
                emptyView.style.display = 'none';
                
                // 更新百分比
                const percentageValue = panel.querySelector('.percentage-value');
                if (percentageValue) {
                    percentageValue.textContent = `${stats.knownPercentage || 0}%`;
                }

                // 更新统计数据
                const totalWords = panel.querySelector('.total-words');
                if (totalWords) {
                    totalWords.textContent = stats.totalWords || 0;
                }

                const knownWords = panel.querySelector('.known-words');
                if (knownWords) {
                    knownWords.textContent = stats.knownWords || 0;
                }

                const newWords = panel.querySelector('.new-words');
                if (newWords) {
                    newWords.textContent = stats.newWords || 0;
                }

                // 更新难度标签
                const badge = panel.querySelector('.difficulty-badge');
                if (badge) {
                    badge.dataset.difficulty = stats.difficulty || '未知';
                    badge.textContent = `难度: ${stats.difficulty || '未知'}`;
                }
            }
        }

        // 添加拖动功能
        makeDraggable(panel) {
            let isDragging = false;
            let startX;
            let startY;
            let startTop;
            let startLeft;
            let rafId = null;  // requestAnimationFrame ID

            // 移除可能存在的旧事件监听器
            panel.removeEventListener('mousedown', panel._dragStart);
            document.removeEventListener('mousemove', panel._drag);
            document.removeEventListener('mouseup', panel._dragEnd);

            // 使用 transform 代替 top/left 来提高性能
            const setPosition = (x, y) => {
                panel.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            };

            // 创建事件处理函数
            panel._dragStart = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                
                startX = e.clientX;
                startY = e.clientY;
                const rect = panel.getBoundingClientRect();
                startTop = rect.top;
                startLeft = rect.left;

                // 初始化位置
                panel.style.left = `${startLeft}px`;
                panel.style.top = `${startTop}px`;
                setPosition(0, 0);

                if (e.target === panel || panel.contains(e.target)) {
                    isDragging = true;
                    panel.style.willChange = 'transform';  // 提示浏览器即将进行动画
                }
            };

            // 使用 requestAnimationFrame 优化渲染
            const updatePosition = (newLeft, newTop) => {
                if (rafId) {
                    cancelAnimationFrame(rafId);
                }
                
                rafId = requestAnimationFrame(() => {
                    const x = newLeft - startLeft;
                    const y = newTop - startTop;
                    setPosition(x, y);
                });
            };

            panel._drag = (e) => {
                if (isDragging) {
                    e.preventDefault();
                    
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    let newLeft = startLeft + dx;
                    let newTop = startTop + dy;

                    // 获取视窗尺寸
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    // 获取面板当前尺寸
                    const panelRect = panel.getBoundingClientRect();
                    const panelWidth = panelRect.width;
                    const panelHeight = panelRect.height;

                    // 限制X轴移动范围
                    newLeft = Math.min(newLeft, viewportWidth - panelWidth - 20);
                    newLeft = Math.max(newLeft, 20);

                    // 限制Y轴移动范围
                    newTop = Math.min(newTop, viewportHeight - panelHeight - 20);
                    newTop = Math.max(newTop, 20);

                    updatePosition(newLeft, newTop);
                }
            };

            panel._dragEnd = () => {
                isDragging = false;
                panel.style.willChange = 'auto';  // 释放优化
                
                // 在拖拽结束时更新实际位置
                const transform = new WebKitCSSMatrix(getComputedStyle(panel).transform);
                const newLeft = startLeft + transform.m41;
                const newTop = startTop + transform.m42;
                
                panel.style.transform = 'none';
                panel.style.left = `${newLeft}px`;
                panel.style.top = `${newTop}px`;
                
                startLeft = newLeft;
                startTop = newTop;
            };

            // 监听窗口大小变化
            window.addEventListener('resize', () => {
                if (isDragging) return;  // 如果正在拖拽，不处理resize
                
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                const panelRect = panel.getBoundingClientRect();
                const panelWidth = panelRect.width;
                const panelHeight = panelRect.height;

                let left = panelRect.left;
                let top = panelRect.top;
                    
                // 调整位置确保在视窗内
                left = Math.min(left, viewportWidth - panelWidth - 20);
                left = Math.max(left, 20);
                top = Math.min(top, viewportHeight - panelHeight - 20);
                top = Math.max(top, 20);
                    
                panel.style.left = `${left}px`;
                panel.style.top = `${top}px`;
            });

            // 添加事件监听器
            panel.addEventListener('mousedown', panel._dragStart);
            document.addEventListener('mousemove', panel._drag);
            document.addEventListener('mouseup', panel._dragEnd);
        }

        getDifficultyColor(difficulty) {
            const colors = {
                '简单': '#10B981',      // 绿色
                '适合 (i+1)': '#60A5FA', // 蓝色
                '挑战': '#FBBF24',      // 黄色
                '较难': '#F59E0B',      // 橙色
                '困难': '#EF4444',       // 红色
                '无英文内容': '#9CA3AF'   // 灰色
            };
            return colors[difficulty] || '#ffffff';
        }

        // 清除所有视觉标记
        clearHighlights() {
            document.querySelectorAll('.i-plus-one-text').forEach(wrapper => {
                const parent = wrapper.parentNode;
                const text = wrapper.textContent;
                const textNode = document.createTextNode(text);
                parent.replaceChild(textNode, wrapper);
            });
        }

        addEventListeners(panel, stats) {
            // 添加事件监听
            const minimizeBtn = panel.querySelector('#minimizeBtn');
            minimizeBtn.addEventListener('click', () => {
                this.switchToMinimalView(panel, stats);
            });

            minimizeBtn.addEventListener('mouseenter', () => {
                minimizeBtn.style.opacity = '1';
                minimizeBtn.style.background = 'rgba(147, 197, 253, 0.2)';
            });
            minimizeBtn.addEventListener('mouseleave', () => {
                minimizeBtn.style.opacity = '0.8';
                minimizeBtn.style.background = 'rgba(147, 197, 253, 0.1)';
            });

            panel.querySelector('#closeBtn').addEventListener('click', () => {
                this.clearHighlights();
                panel.remove();
            });
        }

        // 渲染最小化状态
        switchToMinimalView(panel, stats) {
            const rect = panel.getBoundingClientRect();
            
            Object.assign(panel.style, {
                width: 'auto',
                padding: '12px',
                cursor: 'pointer',
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                right: 'auto'
            });

            panel.classList.add('minimized-panel');
            this.updateMinimalContent(panel, stats);

            // 添加点击展开的事件处理
            const expandHandler = () => {
                panel.classList.remove('minimized-panel');
                Object.assign(panel.style, {
                    width: '300px',
                    padding: '20px',
                    cursor: 'default'
                });
                this.renderExpandedView(panel, stats);
            };

            // 使用事件委托，只在点击 minimized 类时触发
            panel.addEventListener('click', (e) => {
                if (e.target.closest('.minimized')) {
                    expandHandler();
                }
            });

            // 重新添加拖动功能
            this.makeDraggable(panel);
        }

        updateMinimalContent(panel, stats) {
            const content = `
                <div class="minimized" data-difficulty="${stats.difficulty}">
                    <div class="percentage-value">${stats.knownPercentage}%</div>
                    <div class="difficulty-label">${this.getShortDifficulty(stats.difficulty)}</div>
                </div>
            `;
            panel.innerHTML = content;
        }

        // 获取简短的难度描述
        getShortDifficulty(difficulty) {
            const map = {
                '简单': 'Easy',
                '适合 (i+1)': 'i+1',
                '挑战': 'Mid',
                '较难': 'Hard',
                '困难': 'Hard+',
                '无英文内容': 'Empty'
            };
            return map[difficulty] || difficulty;
        }

        // 判断节点是否是正文内容
        isContentNode(element) {
            // 检查标签
            const contentTags = ['P', 'ARTICLE', 'SECTION', 'DIV', 'MAIN', 'SPAN', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'A'];
            if (!contentTags.includes(element.tagName)) {
                return false;
            }

            // 链接标签特殊处理
            if (element.tagName === 'A') {
                // 链接文本只要包含英文单词就处理
                return /[a-zA-Z]{2,}/.test(element.textContent);
            }

            // 标题标签特殊处理
            const isHeading = /^H[1-6]$/.test(element.tagName);
            if (isHeading) {
                // 标题只要包含英文单词就处理
                return /[a-zA-Z]{2,}/.test(element.textContent);
            }

            // 检查文本长度（太短的可能不是正文）
            const text = element.textContent.trim();
            if (text.length < 5) {  // 可以调整这个阈值
                return false;
            }

            // 检查是否包含完整句子（通过标点符号判断）
            const hasSentence = /[.!?。！？]/.test(text);
            if (!hasSentence) {
                return false;
            }

            // 检查文本密度（文本长度与HTML长度的比率）
            const textDensity = text.length / element.innerHTML.length;
            if (textDensity < 0.1) {  // 可以调整这个阈值
                return false;
            }

            return true;
        }

        // 更新单词状态
        async updateWordStatus(word, status) {
            word = word.toLowerCase();
            
            // 从所有状态中移除该单词
            delete this.knownWords[word];
            delete this.learningWords[word];
            
            // 根据新状态添加单词
            switch (status) {
                case 'known':
                    this.knownWords[word] = true;
                    break;
                case 'learning':
                    this.learningWords[word] = true;
                    break;
                case 'unknown':
                    // 未掌握状态不需要存储，从其他状态移除即可
                    break;
            }
            
            // 保存到本地存储
            await chrome.storage.local.set({
                knownWords: this.knownWords,
                learningWords: this.learningWords
            });
            
            // 更新页面上该单词的所有实例
            this.updateWordDisplay(word, status);
        }

        // 更新页面上单词的显示
        updateWordDisplay(word, status) {
            // 更新选择器以包含所有可能的类名
            const wordElements = document.querySelectorAll(
                `.i-plus-one-known, .i-plus-one-new, .i-plus-one-learning`
            );
            
            wordElements.forEach(element => {
                if (element.textContent.toLowerCase() === word) {
                    // 移除所有可能的类名
                    element.classList.remove(
                        'i-plus-one-known',
                        'i-plus-one-new',
                        'i-plus-one-learning'
                    );
                    
                    // 添加新的类名
                    switch (status) {
                        case 'known':
                            element.classList.add('i-plus-one-known');
                            break;
                        case 'learning':
                            element.classList.add('i-plus-one-learning');
                            break;
                        default:
                            element.classList.add('i-plus-one-new');
                    }
                }
            });
        }

        // 添加 playPronunciation 方法
        playPronunciation(word) {
            const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${word}`);
            audio.play();
        }

        // 添加 toggleFavorite 方法
        async toggleFavorite(word) {
            const result = await chrome.storage.local.get(['favoriteWords']);
            const favoriteWords = result.favoriteWords || new Set();
            
            if (favoriteWords.has(word)) {
                favoriteWords.delete(word);
            } else {
                favoriteWords.add(word);
            }
            
            await chrome.storage.local.set({ favoriteWords });
        }

        // 添加 setDifficulty 方法
        async setDifficulty(word, difficulty) {
            const result = await chrome.storage.local.get(['wordDifficulties']);
            const wordDifficulties = result.wordDifficulties || {};
            
            wordDifficulties[word] = difficulty;
            await chrome.storage.local.set({ wordDifficulties });
        }

        // 添加 positionTooltip 方法
        positionTooltip(tooltip, event) {
            const margin = 10; // 与鼠标的距离
            const screenPadding = 20; // 与屏幕边缘的最小距离

            // 获取屏幕尺寸
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            // 获取工具提示框的尺寸
            const tooltipRect = tooltip.getBoundingClientRect();
            const tooltipWidth = tooltipRect.width;
            const tooltipHeight = tooltipRect.height;

            // 计算位置
            let left = event.clientX + margin;
            let top = event.clientY + margin;

            // 确保不超出右边界
            if (left + tooltipWidth > screenWidth - screenPadding) {
                left = event.clientX - tooltipWidth - margin;
            }

            // 确保不超出下边界
            if (top + tooltipHeight > screenHeight - screenPadding) {
                top = event.clientY - tooltipHeight - margin;
            }

            // 确保不超出左边界
            if (left < screenPadding) {
                left = screenPadding;
            }

            // 确保不超出上边界
            if (top < screenPadding) {
                top = screenPadding;
            }

            // 应用位置
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        }

        // 初始化页面导航监听
        initNavigationListener() {
            // 监听 beforeunload 事件
            window.addEventListener('beforeunload', () => {
                this.removePanel();
            });

            // 监听单页应用的路由变化
            if (window.history && window.history.pushState) {
                const originalPushState = history.pushState;
                const originalReplaceState = history.replaceState;

                history.pushState = function() {
                    originalPushState.apply(this, arguments);
                    window.dispatchEvent(new Event('locationchange'));
                };

                history.replaceState = function() {
                    originalReplaceState.apply(this, arguments);
                    window.dispatchEvent(new Event('locationchange'));
                };

                window.addEventListener('popstate', () => {
                    window.dispatchEvent(new Event('locationchange'));
                });

                window.addEventListener('locationchange', () => {
                    this.removePanel();
                });
            }
        }

        // 移除面板的方法
        removePanel() {
            const panel = document.querySelector('.english-i-plus-one-panel');
            if (panel) {
                this.clearHighlights();
                panel.remove();
            }
        }
    }
}

// 修改实例化的方式
if (!window.contentAnalyzer) {
    window.contentAnalyzer = new window.ContentAnalyzer();
} 