// ==========================================
// TimelineKeyframeUI - タイムライン上のキーフレームUI
// ==========================================

class TimelineKeyframeUI {
    constructor() {
        this.selectedClip = null;
        this.activeParameter = null; // 現在編集中のパラメータ
        this.isDraggingKeyframe = false;
        this.draggedKeyframe = null;
        this.keyframeElements = new Map(); // clipId -> parameter -> [elements]
    }
    
    init() {
        console.log('TimelineKeyframeUI initialized');
        this.setupGlobalEvents();
    }
    
    setupGlobalEvents() {
        // グローバルなマウスイベント
        document.addEventListener('mousemove', (e) => this.onGlobalMouseMove(e));
        document.addEventListener('mouseup', () => this.onGlobalMouseUp());
    }
    
    // クリップ選択時にキーフレーム編集パネルを表示
    showKeyframePanel(clip, trackId) {
        this.selectedClip = clip;
        this.selectedTrackId = trackId;
        
        // 既存のパネルを削除
        const existingPanel = document.querySelector('.timeline-keyframe-panel');
        if (existingPanel) existingPanel.remove();
        
        // キーフレーム編集パネルを作成
        const panel = document.createElement('div');
        panel.className = 'timeline-keyframe-panel';
        panel.innerHTML = `
            <div class="keyframe-panel-header">
                <span class="keyframe-panel-title">🎬 ${clip.name}</span>
                <button class="keyframe-panel-close">✕</button>
            </div>
            <div class="keyframe-panel-controls">
                <div class="keyframe-param-group">
                    <label>ボリューム</label>
                    <input type="range" class="keyframe-param-slider" data-param="volume" min="0" max="2" step="0.01" value="1">
                    <span class="keyframe-param-value">1.0</span>
                    <button class="keyframe-record-btn" data-param="volume" title="キーフレーム記録">●</button>
                </div>
                <div class="keyframe-param-group">
                    <label>パン</label>
                    <input type="range" class="keyframe-param-slider" data-param="pan" min="-1" max="1" step="0.01" value="0">
                    <span class="keyframe-param-value">C</span>
                    <button class="keyframe-record-btn" data-param="pan" title="キーフレーム記録">●</button>
                </div>
                <div class="keyframe-param-group">
                    <label>ゲイン</label>
                    <input type="range" class="keyframe-param-slider" data-param="gain" min="-24" max="24" step="0.1" value="0">
                    <span class="keyframe-param-value">0.0 dB</span>
                    <button class="keyframe-record-btn" data-param="gain" title="キーフレーム記録">●</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // イベント設定
        this.setupPanelEvents(panel, clip, trackId);
        
        // キーフレームを描画
        this.renderKeyframesForClip(clip.id, trackId);
    }
    
    setupPanelEvents(panel, clip, trackId) {
        // 閉じるボタン
        panel.querySelector('.keyframe-panel-close').addEventListener('click', () => {
            this.hideKeyframePanel();
        });
        
        // スライダーイベント
        panel.querySelectorAll('.keyframe-param-slider').forEach(slider => {
            const param = slider.dataset.param;
            const valueDisplay = slider.parentElement.querySelector('.keyframe-param-value');
            
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                
                // 値の表示を更新
                this.updateValueDisplay(valueDisplay, param, value);
                
                // 記録ボタンがアクティブな場合、自動でキーフレーム追加
                const recordBtn = slider.parentElement.querySelector('.keyframe-record-btn');
                if (recordBtn.classList.contains('active')) {
                    const currentTime = window.audioEngine.currentTime - clip.startTime;
                    this.addOrUpdateKeyframe(clip.id, trackId, param, currentTime, value);
                }
            });
        });
        
        // 記録ボタン
        panel.querySelectorAll('.keyframe-record-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const param = btn.dataset.param;
                
                // トグル
                const wasActive = btn.classList.contains('active');
                
                // 全ての記録ボタンを非アクティブに
                panel.querySelectorAll('.keyframe-record-btn').forEach(b => {
                    b.classList.remove('active');
                });
                
                if (!wasActive) {
                    btn.classList.add('active');
                    this.activeParameter = param;
                    
                    // 現在位置にキーフレーム追加
                    const slider = panel.querySelector(`.keyframe-param-slider[data-param="${param}"]`);
                    const value = parseFloat(slider.value);
                    const currentTime = window.audioEngine.currentTime - clip.startTime;
                    
                    this.addOrUpdateKeyframe(clip.id, trackId, param, currentTime, value);
                } else {
                    this.activeParameter = null;
                }
            });
        });
        
        // 再生位置変更時にスライダーを更新
        this.startValueTracking(clip, panel);
    }
    
    updateValueDisplay(element, param, value) {
        switch (param) {
            case 'volume':
                element.textContent = value.toFixed(2);
                break;
            case 'pan':
                if (value === 0) {
                    element.textContent = 'C';
                } else if (value < 0) {
                    element.textContent = `L${Math.abs(Math.round(value * 100))}`;
                } else {
                    element.textContent = `R${Math.round(value * 100)}`;
                }
                break;
            case 'gain':
                element.textContent = value.toFixed(1) + ' dB';
                break;
        }
    }
    
    startValueTracking(clip, panel) {
        // 再生中にキーフレーム値を追跡してスライダーを更新
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
        }
        
        this.trackingInterval = setInterval(() => {
            if (!this.selectedClip || this.selectedClip.id !== clip.id) {
                clearInterval(this.trackingInterval);
                return;
            }
            
            const currentTime = window.audioEngine.currentTime - clip.startTime;
            
            // 各パラメータの現在値を取得してスライダーを更新
            ['volume', 'pan', 'gain'].forEach(param => {
                const defaultValues = { volume: 1, pan: 0, gain: 0 };
                const value = window.keyframeManager.getValueAtTime(
                    clip.id,
                    param,
                    currentTime,
                    defaultValues[param]
                );
                
                const slider = panel.querySelector(`.keyframe-param-slider[data-param="${param}"]`);
                const valueDisplay = panel.querySelector(`.keyframe-param-slider[data-param="${param}"]`)
                    ?.parentElement.querySelector('.keyframe-param-value');
                
                if (slider && !slider.matches(':active')) {
                    slider.value = value;
                    if (valueDisplay) {
                        this.updateValueDisplay(valueDisplay, param, value);
                    }
                }
            });
        }, 50);
    }
    
    hideKeyframePanel() {
        const panel = document.querySelector('.timeline-keyframe-panel');
        if (panel) panel.remove();
        
        this.selectedClip = null;
        this.activeParameter = null;
        
        if (this.trackingInterval) {
            clearInterval(this.trackingInterval);
        }
    }
    
    // キーフレーム追加または更新
    addOrUpdateKeyframe(clipId, trackId, parameter, time, value) {
        // クリップの範囲内に制限
        const clip = window.trackManager.getTrack(trackId)?.clips.find(c => c.id === clipId);
        if (!clip) return;
        
        time = Math.max(0, Math.min(clip.duration, time));
        
        // 近くにキーフレームがあれば更新、なければ追加
        const nearest = window.keyframeManager.getNearestKeyframe(clipId, parameter, time, 0.1);
        
        if (nearest) {
            window.keyframeManager.updateKeyframe(clipId, parameter, nearest.id, { value });
        } else {
            window.keyframeManager.addKeyframe(clipId, parameter, time, value, 'linear');
        }
        
        // 再描画
        this.renderKeyframesForClip(clipId, trackId);
    }
    
    // クリップのキーフレームを描画
    renderKeyframesForClip(clipId, trackId) {
        // 既存のキーフレーム要素を削除
        this.removeKeyframeElements(clipId);
        
        const clip = window.trackManager.getTrack(trackId)?.clips.find(c => c.id === clipId);
        if (!clip) return;
        
        const clipElement = document.querySelector(`.track-clip[data-clip-id="${clipId}"]`);
        if (!clipElement) return;
        
        // 各パラメータのキーフレームを描画
        ['volume', 'pan', 'gain'].forEach((param, index) => {
            const keyframes = window.keyframeManager.getParameterKeyframes(clipId, param);
            
            keyframes.forEach(kf => {
                this.createKeyframeDiamond(clipElement, clip, kf, param, trackId, index);
            });
        });
    }
    
    createKeyframeDiamond(clipElement, clip, keyframe, parameter, trackId, paramIndex) {
        const diamond = document.createElement('div');
        diamond.className = 'keyframe-diamond';
        diamond.dataset.keyframeId = keyframe.id;
        diamond.dataset.parameter = parameter;
        diamond.dataset.clipId = clip.id;
        
        // 位置を計算
        const leftPos = (keyframe.time / clip.duration) * 100;
        diamond.style.left = `${leftPos}%`;
        
        // パラメータごとに色を変える
        const colors = {
            volume: '#4A90E2',
            pan: '#E24A90',
            gain: '#90E24A'
        };
        diamond.style.backgroundColor = colors[parameter] || '#999';
        
        // 縦位置をパラメータごとにずらす
        diamond.style.bottom = `${5 + paramIndex * 15}px`;
        
        // ツールチップ
        diamond.title = `${parameter}: ${keyframe.value.toFixed(2)} @ ${keyframe.time.toFixed(2)}s`;
        
        // イベント
        diamond.addEventListener('mousedown', (e) => this.onKeyframeDiamondMouseDown(e, keyframe, clip.id, trackId, parameter));
        diamond.addEventListener('contextmenu', (e) => this.onKeyframeDiamondRightClick(e, keyframe, clip.id, trackId, parameter));
        
        clipElement.appendChild(diamond);
        
        // 要素を記録
        if (!this.keyframeElements.has(clip.id)) {
            this.keyframeElements.set(clip.id, {});
        }
        if (!this.keyframeElements.get(clip.id)[parameter]) {
            this.keyframeElements.get(clip.id)[parameter] = [];
        }
        this.keyframeElements.get(clip.id)[parameter].push(diamond);
    }
    
    removeKeyframeElements(clipId) {
        const clipElement = document.querySelector(`.track-clip[data-clip-id="${clipId}"]`);
        if (clipElement) {
            clipElement.querySelectorAll('.keyframe-diamond').forEach(el => el.remove());
        }
        this.keyframeElements.delete(clipId);
    }
    
    onKeyframeDiamondMouseDown(e, keyframe, clipId, trackId, parameter) {
        if (e.button !== 0) return; // 左クリックのみ
        
        e.stopPropagation();
        e.preventDefault();
        
        this.isDraggingKeyframe = true;
        this.draggedKeyframe = {
            keyframe,
            clipId,
            trackId,
            parameter,
            startX: e.clientX,
            startTime: keyframe.time
        };
        
        document.body.style.cursor = 'grabbing';
    }
    
    onGlobalMouseMove(e) {
        if (!this.isDraggingKeyframe || !this.draggedKeyframe) return;
        
        const clip = window.trackManager.getTrack(this.draggedKeyframe.trackId)?.clips
            .find(c => c.id === this.draggedKeyframe.clipId);
        if (!clip) return;
        
        const clipElement = document.querySelector(`.track-clip[data-clip-id="${this.draggedKeyframe.clipId}"]`);
        if (!clipElement) return;
        
        // マウスの移動量から時間の変化を計算
        const deltaX = e.clientX - this.draggedKeyframe.startX;
        const deltaTime = deltaX / window.trackManager.pixelsPerSecond;
        const newTime = Math.max(0, Math.min(clip.duration, this.draggedKeyframe.startTime + deltaTime));
        
        // キーフレームを更新
        window.keyframeManager.updateKeyframe(
            this.draggedKeyframe.clipId,
            this.draggedKeyframe.parameter,
            this.draggedKeyframe.keyframe.id,
            { time: newTime }
        );
        
        // 再描画
        this.renderKeyframesForClip(this.draggedKeyframe.clipId, this.draggedKeyframe.trackId);
    }
    
    onGlobalMouseUp() {
        if (this.isDraggingKeyframe) {
            this.isDraggingKeyframe = false;
            this.draggedKeyframe = null;
            document.body.style.cursor = '';
        }
    }
    
    onKeyframeDiamondRightClick(e, keyframe, clipId, trackId, parameter) {
        e.preventDefault();
        e.stopPropagation();
        
        // キーフレームを削除
        if (confirm(`キーフレームを削除しますか?\n${parameter}: ${keyframe.value.toFixed(2)} @ ${keyframe.time.toFixed(2)}s`)) {
            window.keyframeManager.removeKeyframe(clipId, parameter, keyframe.id);
            this.renderKeyframesForClip(clipId, trackId);
        }
    }
}

// グローバルインスタンス
window.timelineKeyframeUI = new TimelineKeyframeUI();
