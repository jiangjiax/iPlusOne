class Onboarding {
    constructor() {
        this.currentStep = 1;
        this.selectedLevel = null;
        this.initializeEventListeners();
    }

    checkIfPopup() {
        if (window.innerWidth < 801) {
            document.body.classList.add('popup');
        }
    }

    initializeEventListeners() {
        // 下一步按钮事件
        document.querySelectorAll('.next-btn').forEach(btn => {
            btn.addEventListener('click', () => this.nextStep());
        });

        // 等级选择事件
        document.querySelectorAll('.level-option').forEach(option => {
            option.addEventListener('click', (e) => this.selectLevel(e));
        });
    }

    nextStep() {
        const currentStepEl = document.getElementById(`step${this.currentStep}`);
        currentStepEl.classList.add('hidden');
        
        this.currentStep++;
        const nextStepEl = document.getElementById(`step${this.currentStep}`);
        nextStepEl.classList.remove('hidden');

        if (this.currentStep === 2) {
            this.loadWordLevels();
        }
    }

    selectLevel(e) {
        const levelOption = e.currentTarget;
        document.querySelectorAll('.level-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        levelOption.classList.add('selected');
        this.selectedLevel = levelOption.dataset.level;
        document.querySelector('#step2 .next-btn').disabled = false;
    }

    async loadWordLevels() {
        try {
            const response = await fetch(chrome.runtime.getURL('data/en.json'));
            const wordData = await response.json();
            
            document.querySelector('#step2 .next-btn').addEventListener('click', () => {
                this.saveUserLevel(wordData);
            });
        } catch (error) {
            console.error('Error loading word data:', error);
        }
    }

    async saveUserLevel(wordData) {
        const levelThresholds = {
            'A1': 1500,
            'A2': 3000,
            'B1': 4000,
            'B2': 8000,
            'C1': 10000,
            'C2': 20000
        };

        const threshold = levelThresholds[this.selectedLevel];
        const knownWords = {};
        
        // 1. 首先添加根据用户水平的基础词汇
        wordData.filter(word => word.rank <= threshold)
            .forEach(word => {
                knownWords[word.word.toLowerCase()] = true;
            });
        
        // 2. 加载并添加高频词
        try {
            const response = await fetch(chrome.runtime.getURL('data/high_frequency_words.json'));
            const highFreqWords = await response.json();
            
            // 将所有高频词添加到已知词汇表中
            highFreqWords.words.forEach(wordObj => {
                knownWords[wordObj.word.toLowerCase()] = true;
            });
        } catch (error) {
            console.error('Error loading high frequency words:', error);
        }

        // 保存到 Chrome 存储
        chrome.storage.local.set({
            userLevel: this.selectedLevel,
            knownWords: knownWords,
            isOnboardingComplete: true
        }, () => {
            // 重定向到主页面
            window.location.href = 'main.html';
        });
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new Onboarding();
}); 