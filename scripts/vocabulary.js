class VocabularyManager {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.page = 1;
        this.pageSize = 20;
        this.loading = false;
        this.hasMore = true;
        this.loadWords();
        this.addScrollToTop();
        this.initInfiniteScroll();
        this.learningCountEl = document.getElementById('learningCount');
        this.masteredCountEl = document.getElementById('masteredCount');
    }

    initializeElements() {
        this.clearKnownWordsBtn = document.getElementById('clearKnownWords');
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.learningList = document.getElementById('learningList');
        this.masteredList = document.getElementById('masteredList');
        this.emptyState = document.getElementById('emptyState');
    }

    bindEvents() {
        // 清空已掌握单词
        this.clearKnownWordsBtn.addEventListener('click', () => this.clearKnownWords());

        // 标签切换
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e));
        });

        // 使用事件委托处理单词卡片按钮点击
        this.learningList.addEventListener('click', (e) => {
            if (e.target.classList.contains('word-btn')) {
                const card = e.target.closest('.word-card');
                const word = card.dataset.word;
                if (card.dataset.status === 'learning') {
                    this.removeFromLearning(word);
                }
            }
        });

        this.masteredList.addEventListener('click', (e) => {
            if (e.target.classList.contains('word-btn')) {
                const card = e.target.closest('.word-card');
                const word = card.dataset.word;
                if (card.dataset.status === 'mastered') {
                    this.changeWordStatus(word, 'unknown');
                }
            }
        });
    }

    async loadWords() {
        if (this.loading || !this.hasMore) return;
        
        try {
            this.loading = true;
            const result = await chrome.storage.local.get(['knownWords', 'learningWords']);
            const knownWords = result.knownWords || {};
            const learningWords = result.learningWords || {};

            // 更新数量显示
            this.updateWordCounts(Object.keys(learningWords).length, Object.keys(knownWords).length);

            // 获取当前显示的列表
            const activeList = document.querySelector('.vocabulary-list:not(.hidden)');
            const isLearning = activeList.id === 'learningList';
            const words = Object.keys(isLearning ? learningWords : knownWords);

            // 如果没有单词，直接返回
            if (words.length === 0) {
                this.hasMore = false;
                this.updateEmptyState();
                return;
            }

            // 计算分页
            const start = (this.page - 1) * this.pageSize;
            const end = start + this.pageSize;
            const pageWords = words.slice(start, end);

            // 检查是否还有更多数据
            this.hasMore = end < words.length;

            // 添加单词卡片
            pageWords.forEach(word => {
                activeList.appendChild(this.createWordCard(word, isLearning ? 'learning' : 'mastered'));
            });

            this.page++;
            this.updateEmptyState();
        } catch (error) {
            console.error('Error loading words:', error);
        } finally {
            this.loading = false;
            
            // 如果没有更多数据，隐藏加载指示器
            // if (!this.hasMore) {
            //     this.loadingIndicator.classList.add('hidden');
            // }
        }
    }

    createWordCard(word, status) {
        const card = document.createElement('div');
        card.className = 'word-card';
        card.dataset.word = word.toLowerCase();
        card.dataset.status = status;

        card.innerHTML = `
            <div class="word-text">${word}</div>
            <div class="word-translation">Loading...</div>
            <div class="word-actions">
                ${status === 'learning' ? `
                    <button class="word-btn btn-remove">
                        移出学习列表
                    </button>
                ` : `
                    <button class="word-btn btn-unknown">
                        标记为未掌握
                    </button>
                `}
            </div>
        `;

        // 获取单词释义
        this.fetchWordTranslation(word).then(translation => {
            card.querySelector('.word-translation').textContent = translation;
        });

        return card;
    }

    async fetchWordTranslation(word) {
        try {
            const response = await fetch(`https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`);
            const data = await response.json();
            // 这里需要根据有道词典 API 的实际返回格式提取翻译
            return data.ec?.word[0]?.trs[0]?.tr[0]?.l?.i[0] || '无释义';
        } catch (error) {
            console.error('Error fetching translation:', error);
            return '获取释义失败';
        }
    }

    async changeWordStatus(word, newStatus) {
        try {
            const result = await chrome.storage.local.get(['knownWords', 'learningWords']);
            const knownWords = result.knownWords || {};
            const learningWords = result.learningWords || {};

            if (newStatus === 'unknown') {
                delete knownWords[word];
            }

            await chrome.storage.local.set({ knownWords });  // 只需要保存 knownWords
            
            // 更新数量显示
            this.updateWordCounts(Object.keys(learningWords).length, Object.keys(knownWords).length);

            // 重置分页并重新加载已掌握列表
            this.page = 1;
            this.hasMore = true;
            this.masteredList.innerHTML = '';
            this.loadWords();
        } catch (error) {
            console.error('Error changing word status:', error);
        }
    }

    async removeFromLearning(word) {
        try {
            const result = await chrome.storage.local.get(['learningWords']);
            const learningWords = result.learningWords || {};

            // 从学习中列表移除
            delete learningWords[word];

            await chrome.storage.local.set({ learningWords });
            
            // 更新数量显示
            const knownResult = await chrome.storage.local.get(['knownWords']);
            const knownWords = knownResult.knownWords || {};
            this.updateWordCounts(Object.keys(learningWords).length, Object.keys(knownWords).length);

            // 重置分页并重新加载学习中列表
            this.page = 1;
            this.hasMore = true;
            this.learningList.innerHTML = '';
            this.loadWords();
        } catch (error) {
            console.error('Error removing word from learning:', error);
        }
    }

    async clearKnownWords() {
        if (confirm('确定要清空已掌握的单词吗？此操作不可撤销。')) {
            try {
                // 同时清空已掌握单词和重置引导状态
                await chrome.storage.local.set({ 
                    knownWords: {},
                    isOnboardingComplete: false
                });
                
                // 更新数量显示
                const result = await chrome.storage.local.get(['learningWords']);
                const learningWords = result.learningWords || {};
                this.updateWordCounts(Object.keys(learningWords).length, 0);

                // 重新加载单词列表
                this.loadWords();
            } catch (error) {
                console.error('Error clearing known words:', error);
            }
        }
    }

    switchTab(e) {
        // 更新标签按钮状态
        this.tabBtns.forEach(btn => btn.classList.remove('active'));
        e.currentTarget.classList.add('active');

        // 显示对应的列表
        const tab = e.currentTarget.dataset.tab;
        if (tab === 'learning') {
            this.learningList.classList.remove('hidden');
            this.masteredList.classList.add('hidden');
        } else {
            this.learningList.classList.add('hidden');
            this.masteredList.classList.remove('hidden');
        }

        // 重置分页
        this.page = 1;
        this.hasMore = true;
        this.learningList.innerHTML = '';
        this.masteredList.innerHTML = '';
        this.loadWords();
        this.updateEmptyState();
    }

    updateEmptyState() {
        const activeList = document.querySelector('.vocabulary-list:not(.hidden)');
        const visibleCards = activeList.querySelectorAll('.word-card');

        if (visibleCards.length === 0) {
            this.emptyState.classList.remove('hidden');
        } else {
            this.emptyState.classList.add('hidden');
        }
    }

    initInfiniteScroll() {
        // 监听滚动事件
        window.addEventListener('scroll', () => {
            if (this.loading) return;

            const {scrollTop, scrollHeight, clientHeight} = document.documentElement;
            if (scrollTop + clientHeight >= scrollHeight - 100) {
                this.loadWords();
            }

            // 显示/隐藏返回顶部按钮
            this.updateScrollToTopVisibility();
        });
    }

    addScrollToTop() {
        const scrollToTopBtn = document.createElement('button');
        scrollToTopBtn.className = 'scroll-to-top hidden';
        scrollToTopBtn.innerHTML = '⬆';
        document.body.appendChild(scrollToTopBtn);

        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });

        this.scrollToTopBtn = scrollToTopBtn;
    }

    updateScrollToTopVisibility() {
        if (window.scrollY > 300) {
            this.scrollToTopBtn.classList.remove('hidden');
        } else {
            this.scrollToTopBtn.classList.add('hidden');
        }
    }

    updateWordCounts(learningCount, masteredCount) {
        this.learningCountEl.textContent = learningCount;
        this.masteredCountEl.textContent = masteredCount;
    }
}

// 初始化
let vocabularyManager;
document.addEventListener('DOMContentLoaded', () => {
    vocabularyManager = new VocabularyManager();
}); 