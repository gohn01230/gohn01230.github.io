// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA5LlGHl9djJsx_Rs3evjd8Xzpn0e25IHI",
    authDomain: "gohn-games.firebaseapp.com",
    projectId: "gohn-games",
    storageBucket: "gohn-games.firebasestorage.app",
    messagingSenderId: "837388013481",
    appId: "1:837388013481:web:3d1c87fd31442284653eb8",
    measurementId: "G-8PBX8E8D15"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let currentUser = null;
let userProfile = { coins: 0 };
let selectedGame = null;
let currentChallengeId = null;
let activeRoomId = null;
let roomListener = null;
let isAdmin = false;

const OWNER_EMAIL = "gohngohn099@gmail.com";

// Toast Notification
function showToast(message, type = "info", icon = "🔔") {
    const toast = document.getElementById("toast");
    document.getElementById("toast-message").innerText = message;
    document.getElementById("toast-icon").innerText = icon;
    toast.className = `toast ${type}`;
    toast.classList.add("active");
    setTimeout(() => toast.classList.remove("active"), 3500);
}

// Login
function login() {
    auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .catch(err => showToast("خطأ في الدخول: " + err.message, "danger", "❌"));
}

// Auth State Change
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        
        if (user.email === OWNER_EMAIL) {
            isAdmin = true;
            document.getElementById('admin-btn').classList.add('show');
            loadAdminGames();
        }
        
        document.getElementById('view-auth').style.display = 'none';
        document.getElementById('view-main').style.display = 'block';
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('coin-badge').style.display = 'flex';
        document.getElementById('bottom-nav').style.display = 'flex';
        
        let photo = user.photoURL || "https://via.placeholder.com/36";
        let name = user.displayName || "لاعب";
        
        document.getElementById('user-avatar').src = photo;
        document.getElementById('user-name').innerText = name.split(' ')[0];
        
        // Save user data
        db.collection("users_profile").doc(user.uid).set({
            fullName: name,
            photoURL: photo,
            status: "online",
            lastActive: Date.now(),
            coins: firebase.firestore.FieldValue.increment(0)
        }, { merge: true });

        // Listen to user data
        db.collection("users_profile").doc(user.uid).onSnapshot(doc => {
            if (doc.exists) {
                userProfile = doc.data();
                document.getElementById('user-coins').innerText = userProfile.coins || 0;
            }
        });
        
        loadGames();
        listenToPlayers();
        listenToChallenges();
    }
});

// Update status on unload
window.addEventListener('beforeunload', () => {
    if (currentUser) {
        db.collection("users_profile").doc(currentUser.uid).update({ status: "offline" }).catch(() => {});
    }
});

// Tab Switching
function switchTab(tab) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(`page-${tab}`).classList.add('active');
    document.getElementById(`nav-${tab}`).classList.add('active');
}

// Load Games
function loadGames() {
    const offlineGrid = document.getElementById('offline-games-grid');
    const onlineGrid = document.getElementById('online-games-grid');
    
    // Default games
    const defaultGames = [
        { id: 'connect4', name: 'Connect 4', desc: 'وصّل 4 قطع', icon: '🔴', type: 'offline', prize: 30 }
    ];
    
    defaultGames.forEach(game => {
        const card = createGameCard(game);
        if (game.type === 'offline') {
            offlineGrid.appendChild(card);
        } else {
            onlineGrid.appendChild(card);
        }
    });
    
    // Load custom games from Firebase
    db.collection("custom_games").where("status", "==", "active").onSnapshot(snapshot => {
        // Clear custom cards
        document.querySelectorAll('.custom-game-card').forEach(c => c.remove());
        
        snapshot.forEach(doc => {
            const game = doc.data();
            const card = createGameCard({ ...game, id: doc.id });
            card.classList.add('custom-game-card');
            
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
    div.dataset.gameId = game.id;
    div.dataset.gameType = game.type;
    
    div.innerHTML = `
        <div class="game-thumb">${game.icon || '🎮'}</div>
        <div class="game-info">
            <h4>${game.name}</h4>
            <p>${game.desc}</p>
            <span class="game-prize">${game.prize} 🥕</span>
        </div>
    `;
    
    div.onclick = () => {
        document.querySelectorAll('.game-card').forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        selectedGame = game;
        document.getElementById('selection-hint').classList.add('show');
        showToast(`تم اختيار: ${game.name}`, "success", "✅");
    };
    
    return div;
}

// Admin Functions
function toggleAdmin() {
    document.getElementById('admin-panel').classList.toggle('show');
}

function addGame() {
    const name = document.getElementById('game-name').value;
    const desc = document.getElementById('game-desc').value;
    const type = document.getElementById('game-type').value;
    const prize = parseInt(document.getElementById('game-prize').value);
    
    if (!name) {
        showToast("⚠️ يجب إدخال اسم اللعبة!", "danger", "❌");
        return;
    }
    
    db.collection("custom_games").add({
        name,
        desc,
        type,
        prize,
        createdBy: currentUser.uid,
        createdAt: Date.now(),
        status: "active"
    }).then(() => {
        showToast("✅ تم إضافة اللعبة!", "success", "🎮");
        document.getElementById('game-name').value = '';
        document.getElementById('game-desc').value = '';
        loadAdminGames();
    }).catch(err => showToast("❌ خطأ: " + err.message, "danger"));
}

function loadAdminGames() {
    const list = document.getElementById('games-list');
    db.collection("custom_games").where("status", "==", "active").onSnapshot(snapshot => {
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const game = doc.data();
            const item = document.createElement('div');
            item.className = 'admin-game-item';
            item.innerHTML = `
                <div>
                    <strong>${game.name}</strong>
                    <br><small>${game.type === 'online' ? '👥 أونلاين' : '🎮 أوفلاين'} - ${game.prize} 🥕</small>
                </div>
                <button class="btn btn-danger btn-small" onclick="deleteGame('${doc.id}')">🗑️</button>
            `;
            list.appendChild(item);
        });
    });
}

function deleteGame(id) {
    if (!confirm("حذف اللعبة؟")) return;
    db.collection("custom_games").doc(id).delete().then(() => {
        showToast("✅ تم الحذف!", "success", "️");
        loadAdminGames();
    });
}

function updateSiteName() {
    const name = document.getElementById('site-name').value;
    if (name) {
        document.getElementById('brand-name').innerText = name;
        showToast("✅ تم تحديث الاسم!", "success", "✨");
    }
}

// Players
function listenToPlayers() {
    db.collection("users_profile").where("status", "==", "online").onSnapshot(snapshot => {
        const list = document.getElementById('players-list');
        list.innerHTML = '';
        
        snapshot.forEach(doc => {
            if (doc.id !== currentUser.uid && (Date.now() - doc.data().lastActive < 300000)) {
                const player = doc.data();
                const item = document.createElement('div');
                item.className = 'player-item';
                item.innerHTML = `
                    <div class="player-info">
                        <img src="${player.photoURL}" class="player-avatar-list">
                        <div>
                            <div style="font-weight: 800; font-size: 0.9rem;">${player.fullName}</div>
                            <div style="font-size: 0.75rem; color: var(--success-color);">
                                <span class="status-dot"></span>متصل
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-success btn-small" onclick="sendChallenge('${doc.id}', '${player.fullName}')">
                        تحدي ⚔️
                    </button>
                `;
                list.appendChild(item);
            }
        });
        
        if (list.innerHTML === '') {
            list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center;">لا يوجد متصلين حالياً</p>';
        }
    });
}

function sendChallenge(targetId, targetName) {
    if (!selectedGame) {
        showToast("⚠️ اختر لعبة أولاً!", "danger", "❌");
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
        showToast(`✅ تم إرسال تحدي ${selectedGame.name} إلى ${targetName}!`, "success", "️");
    });
}

// Challenges
function listenToChallenges() {
    // Receive challenges
    db.collection("challenges").where("toId", "==", currentUser.uid).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.status === "pending" && (Date.now() - data.timestamp < 60000)) {
                    currentChallengeId = change.doc.id;
                    document.getElementById("challenge-text").innerText = 
                        `[ ${data.fromName} ] يتحداك في ${data.gameTypeName}!`;
                    document.getElementById("modal-overlay").style.display = "block";
                    document.getElementById("challenge-modal").classList.add("show");
                }
            }
        });
    });

    // Sent challenges
    db.collection("challenges").where("fromId", "==", currentUser.uid).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            if (data && data.status === "accepted") {
                change.doc.ref.delete();
                activeRoomId = data.roomId;
                closeAllModals();
                showToast("تم قبول التحدي!", "success", "✅");
            } else if (data && data.status === "rejected") {
                change.doc.ref.delete();
                showToast("رفض الخصم التحدي.", "danger", "❌");
            }
        });
    });
}

function acceptChallenge() {
    if (!currentChallengeId) return;
    const ref = db.collection("challenges").doc(currentChallengeId);
    ref.get().then(doc => {
        if (doc.exists) {
            const challenge = doc.data();
            const roomRef = db.collection("rooms").doc();
            activeRoomId = roomRef.id;
            
            roomRef.set({
                gameType: challenge.gameType,
                player1: challenge.fromId,
                p1Name: challenge.fromName,
                player2: currentUser.uid,
                p2Name: currentUser.displayName,
                status: "playing"
            }).then(() => {
                ref.update({ 
                    status: "accepted", 
                    roomId: activeRoomId,
                    toName: currentUser.displayName 
                });
                closeAllModals();
                showToast("تم قبول التحدي! ابدأ اللعب.", "success", "🎮");
            });
        }
    });
}

function rejectChallenge() {
    if (currentChallengeId) {
        db.collection("challenges").doc(currentChallengeId).update({ status: "rejected" });
    }
    closeAllModals();
}

function closeAllModals() {
    document.getElementById("modal-overlay").style.display = "none";
    document.getElementById("challenge-modal").classList.remove("show");
}

// Buy Upgrade
function buyUpgrade(type, cost) {
    if ((userProfile.coins || 0) >= cost) {
        const update = { coins: firebase.firestore.FieldValue.increment(-cost) };
        let msg = "";
        
        if (type === 'legend_title') {
            update.title = "أسطورة ";
            msg = "تم تفعيل لقب أسطورة!";
        } else if (type === 'gold_frame') {
            update.frame = "gold";
            msg = "تم إضافة الإطار الذهبي!";
        } else if (type === 'luck_boost') {
            update.luckBoost = true;
            msg = "مضاعف الجزر مفعل!";
        }
        
        db.collection("users_profile").doc(currentUser.uid).update(update).then(() => {
            showToast(msg + " ✅", "success", "🎉");
        });
    } else {
        showToast("رصيدك غير كافٍ!", "danger", "❌");
    }
}