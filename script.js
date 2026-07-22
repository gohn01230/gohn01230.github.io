const firebaseConfig = {
    apiKey: "AIzaSyA5LlGHl9djJsx_Rs3evjd8Xzpn0e25IHI",
    authDomain: "gohn-games.firebaseapp.com",
    projectId: "gohn-games",
    storageBucket: "gohn-games.firebasestorage.app",
    messagingSenderId: "837388013481",
    appId: "1:837388013481:web:3d1c87fd31442284653eb8"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userProfile = { coins: 0 };
let isAdmin = false;
let selectedGame = null;
let currentChallengeId = null;
let activeRoomId = null;
let updateInterval = null;

const OWNER_EMAIL = "gohngohn099@gmail.com";

function showToast(msg, icon = "🔔") {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').innerText = msg;
    document.getElementById('toast-icon').innerText = icon;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function login() {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
}

auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        
        if (user.email === OWNER_EMAIL) {
            isAdmin = true;
            document.getElementById('admin-btn').classList.add('show');
        }
        
        document.getElementById('view-auth').style.display = 'none';
        document.getElementById('view-main').style.display = 'block';
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('coin-badge').style.display = 'flex';
        document.getElementById('bottom-nav').style.display = 'flex';
        
        document.getElementById('user-avatar').src = user.photoURL || "https://via.placeholder.com/32";
        document.getElementById('user-name').innerText = (user.displayName || "لاعب").split(' ')[0];
        
        // حفظ البيانات وتحديث lastActive
        db.collection("users_profile").doc(user.uid).set({
            fullName: user.displayName || "لاعب",
            photoURL: user.photoURL || "",
            status: "online",
            lastActive: Date.now(),
            coins: firebase.firestore.FieldValue.increment(0)
        }, { merge: true });
        
        // تحديث lastActive كل 15 ثانية
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(() => {
            if (currentUser) {
                db.collection("users_profile").doc(currentUser.uid).update({
                    lastActive: Date.now(),
                    status: "online"
                });
            }
        }, 15000);
        
        // الاستماع للبيانات
        db.collection("users_profile").doc(user.uid).onSnapshot(doc => {
            if (doc.exists) {
                userProfile = doc.data();
                document.getElementById('user-coins').innerText = userProfile.coins || 0;
            }
        });
        
        loadGames();
        listenToPlayers();
        listenToChallenges();
        listenToAdminCommands();
    }
});

window.addEventListener('beforeunload', () => {
    if (currentUser) {
        db.collection("users_profile").doc(currentUser.uid).update({ status: "offline" });
        if (updateInterval) clearInterval(updateInterval);
    }
});

// تحميل الألعاب
function loadGames() {
    const offlineGrid = document.getElementById('offline-games-grid');
    const onlineGrid = document.getElementById('online-games-grid');
    
    // ألعاب افتراضية
    const defaultGames = [
        { id: 'suika', name: 'Suika Game', icon: '', type: 'offline', prize: 30 }
    ];
    
    defaultGames.forEach(game => {
        const card = createGameCard(game);
        if (game.type === 'offline') {
            offlineGrid.appendChild(card);
        } else {
            onlineGrid.appendChild(card);
        }
    });
    
    // تحميل الألعاب المخصصة
    db.collection("custom_games").where("status", "==", "active").onSnapshot(snap => {
        document.querySelectorAll('.custom-card').forEach(c => c.remove());
        
        snap.forEach(doc => {
            const game = doc.data();
            const card = createGameCard({ ...game, id: doc.id });
            card.classList.add('custom-card');
            
            if (game.type === 'offline') {
                offlineGrid.appendChild(card);
            } else {
                onlineGrid.appendChild(card);
            }
        });
    });
}

function createGameCard(game) {
    const div = document.createElement('div');
    div.className = 'game-card';
    div.innerHTML = `
        <div class="game-icon">${game.icon || '🎮'}</div>
        <div class="game-name">${game.name}</div>
        <div class="game-prize">${game.prize} 🥕</div>
    `;
    
    div.onclick = () => {
        document.querySelectorAll('.game-card').forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        selectedGame = game;
        document.getElementById('selection-hint').classList.add('show');
        showToast(`تم اختيار: ${game.name}`, "✅");
    };
    
    return div;
}

// الاستماع للاعبين المتصلين
function listenToPlayers() {
    db.collection("users_profile").where("status", "==", "online").onSnapshot(snap => {
        const list = document.getElementById('players-list');
        const targetSelect = document.getElementById('target-player');
        
        list.innerHTML = '';
        targetSelect.innerHTML = '<option value="">-- اختر لاعب --</option>';
        
        snap.forEach(doc => {
            const data = doc.data();
            const isRecent = (Date.now() - (data.lastActive || 0)) < 30000;
            
            if (doc.id !== currentUser.uid && isRecent) {
                // إضافة للقائمة
                const item = document.createElement('div');
                item.className = 'player-item';
                item.innerHTML = `
                    <div class="player-info">
                        <img src="${data.photoURL}" class="player-avatar">
                        <div>
                            <strong>${data.fullName}</strong>
                            <div style="font-size:0.8rem;color:#38ef7d">
                                <span class="status-dot"></span>متصل
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-success btn-small" onclick="sendChallenge('${doc.id}','${data.fullName}')">تحدي ⚔️</button>
                `;
                list.appendChild(item);
                
                // إضافة للقائمة المنسدلة
                const option = document.createElement('option');
                option.value = doc.id;
                option.innerText = data.fullName;
                targetSelect.appendChild(option);
            }
        });
        
        if (list.innerHTML === '') {
            list.innerHTML = '<p style="text-align:center;opacity:0.6">لا يوجد متصلين حالياً</p>';
        }
    });
}

// إرسال تحدي
function sendChallenge(targetId, targetName) {
    if (!selectedGame) {
        showToast("️ اختر لعبة أولاً!", "️");
        return;
    }
    
    db.collection("challenges").add({
        fromId: currentUser.uid,
        fromName: currentUser.displayName || "لاعب",
        toId: targetId,
        gameType: selectedGame.id,
        gameTypeName: selectedGame.name,
        status: "pending",
        timestamp: Date.now()
    }).then(() => {
        showToast(`✅ تم إرسال تحدي ${selectedGame.name}!`, "️");
    });
}

// الاستماع للتحديات
function listenToChallenges() {
    db.collection("challenges").where("toId", "==", currentUser.uid).onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.status === "pending" && (Date.now() - data.timestamp < 60000)) {
                    currentChallengeId = change.doc.id;
                    document.getElementById("challenge-text").innerText = 
                        `${data.fromName} يتحداك في ${data.gameTypeName}!`;
                    document.getElementById("modal-overlay").style.display = "block";
                    document.getElementById("challenge-modal").classList.add("show");
                }
            }
        });
    });
    
    db.collection("challenges").where("fromId", "==", currentUser.uid).onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            const data = change.doc.data();
            if (data && data.status === "accepted") {
                change.doc.ref.delete();
                activeRoomId = data.roomId;
                closeModal();
                openCustomGame(data.gameType, data.gameTypeName);
            } else if (data && data.status === "rejected") {
                change.doc.ref.delete();
                showToast("❌ رفض التحدي", "❌");
            }
        });
    });
}

function acceptChallenge() {
    if (!currentChallengeId) return;
    
    const ref = db.collection("challenges").doc(currentChallengeId);
    ref.get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const roomRef = db.collection("rooms").doc();
            
            roomRef.set({
                gameType: data.gameType,
                player1: data.fromId,
                player2: currentUser.uid,
                status: "playing"
            }).then(() => {
                ref.update({ 
                    status: "accepted", 
                    roomId: roomRef.id 
                });
                closeModal();
                openCustomGame(data.gameType, data.gameTypeName);
            });
        }
    });
}

function rejectChallenge() {
    if (currentChallengeId) {
        db.collection("challenges").doc(currentChallengeId).update({ status: "rejected" });
    }
    closeModal();
}

function closeModal() {
    document.getElementById("modal-overlay").style.display = "none";
    document.getElementById("challenge-modal").classList.remove("show");
}

// فتح لعبة مخصصة
function openCustomGame(gameId, gameName) {
    document.getElementById('custom-game-title').innerText = gameName;
    
    const iframe = document.getElementById('custom-game-iframe');
    
    if (gameId === 'suika') {
        iframe.src = 'suika-game.html';
    } else {
        db.collection("custom_games").doc(gameId).get().then(doc => {
            if (doc.exists) {
                const code = doc.data().code;
                iframe.srcdoc = code;
            }
        });
    }
    
    switchTab('custom-game');
}

function exitCustomGame() {
    const iframe = document.getElementById('custom-game-iframe');
    iframe.src = '';
    iframe.srcdoc = '';
    switchTab('games');
}

// لوحة التحكم
function toggleAdmin() {
    document.getElementById('admin-panel').classList.toggle('show');
    if (document.getElementById('admin-panel').classList.contains('show')) {
        loadAdminGames();
    }
}

function addGame() {
    const name = document.getElementById('game-name').value;
    const desc = document.getElementById('game-desc').value;
    const type = document.getElementById('game-type').value;
    const prize = parseInt(document.getElementById('game-prize').value);
    const code = document.getElementById('game-code').value;
    
    if (!name || !code) {
        showToast("⚠️ اسم اللعبة والكود مطلوبان!", "⚠️");
        return;
    }
    
    db.collection("custom_games").add({
        name, desc, type, prize, code,
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        status: "active"
    }).then(() => {
        showToast("✅ تمت إضافة اللعبة!", "✅");
        document.getElementById('game-name').value = '';
        document.getElementById('game-desc').value = '';
        document.getElementById('game-code').value = '';
        loadAdminGames();
    });
}

function loadAdminGames() {
    const list = document.getElementById('games-list');
    list.innerHTML = '';
    
    db.collection("custom_games").where("status", "==", "active").onSnapshot(snap => {
        list.innerHTML = '';
        snap.forEach(doc => {
            const game = doc.data();
            const item = document.createElement('div');
            item.className = 'admin-game-item';
            item.innerHTML = `
                <div>
                    <strong>${game.name}</strong>
                    <div style="font-size:0.8rem;opacity:0.7">${game.type} - ${game.prize} 🥕</div>
                </div>
                <button class="btn btn-danger btn-small" onclick="deleteGame('${doc.id}')">️</button>
            `;
            list.appendChild(item);
        });
    });
}

function deleteGame(id) {
    if (confirm("حذف اللعبة؟")) {
        db.collection("custom_games").doc(id).delete().then(() => {
            showToast("✅ تم الحذف!", "✅");
        });
    }
}

// أوامر الأدمن
function listenToAdminCommands() {
    db.collection("admin_commands").orderBy("timestamp", "desc").limit(10).onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                const age = Date.now() - data.timestamp;
                
                if (age < 5000) {
                    if (data.type === 'rain' && data.amount) {
                        db.collection("users_profile").doc(currentUser.uid).update({
                            coins: firebase.firestore.FieldValue.increment(data.amount)
                        });
                        showToast(`🌧️ مطر جزر! +${data.amount} `, "🌧️");
                    } else if (data.type === 'multiplier') {
                        showToast("✖️ مضاعف x2 مفعل!", "✖️");
                    } else if (data.type === 'announce' && data.message) {
                        showToast(`📢 ${data.message}`, "");
                    }
                }
            }
        });
    });
}

function adminRain() {
    db.collection("admin_commands").add({
        type: 'rain',
        amount: 50,
        timestamp: Date.now(),
        from: currentUser.displayName
    });
    showToast("🌧️ تم إرسال مطر الجزر!", "🌧️");
}

function adminMultiplier() {
    db.collection("admin_commands").add({
        type: 'multiplier',
        duration: 60,
        timestamp: Date.now(),
        from: currentUser.displayName
    });
    showToast("✖️ تم تفعيل المضاعف!", "✖️");
}

function adminAnnounce() {
    const msg = prompt("نص الإعلان:");
    if (msg) {
        db.collection("admin_commands").add({
            type: 'announce',
            message: msg,
            timestamp: Date.now(),
            from: currentUser.displayName
        });
    }
}

function adminGive() {
    const targetId = document.getElementById('target-player').value;
    if (!targetId) {
        showToast("⚠️ اختر لاعب!", "⚠️");
        return;
    }
    const amount = parseInt(prompt("كمية الجزر:"));
    if (amount) {
        db.collection("users_profile").doc(targetId).update({
            coins: firebase.firestore.FieldValue.increment(amount)
        });
        showToast(`💰 تم إعطاء ${amount} 🥕`, "💰");
    }
}

function adminTake() {
    const targetId = document.getElementById('target-player').value;
    if (!targetId) {
        showToast("️ اختر لاعب!", "⚠️");
        return;
    }
    const amount = parseInt(prompt("كمية السحب:"));
    if (amount) {
        db.collection("users_profile").doc(targetId).update({
            coins: firebase.firestore.FieldValue.increment(-amount)
        });
        showToast(`📉 تم سحب ${amount} 🥕`, "📉");
    }
}

function adminKick() {
    const targetId = document.getElementById('target-player').value;
    if (!targetId) {
        showToast("⚠️ اختر لاعب!", "️");
        return;
    }
    if (confirm("طرد اللاعب؟")) {
        db.collection("users_profile").doc(targetId).update({
            status: "offline"
        });
        showToast("🚫 تم الطرد!", "🚫");
    }
}

function buyUpgrade(type, cost) {
    if ((userProfile.coins || 0) >= cost) {
        const update = { coins: firebase.firestore.FieldValue.increment(-cost) };
        
        if (type === 'legend_title') update.title = "أسطورة 🏆";
        else if (type === 'gold_frame') update.frame = "gold";
        else if (type === 'luck_boost') update.luckBoost = true;
        
        db.collection("users_profile").doc(currentUser.uid).update(update).then(() => {
            showToast("✅ تم الشراء!", "✅");
        });
    } else {
        showToast(" رصيد غير كافٍ!", "❌");
    }
}

function switchTab(tab) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`page-${tab}`).classList.add('active');
}
