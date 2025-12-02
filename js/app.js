const BAKIM_MODU = false;
// Apps Script URL'si (Kendi URL'nizle güncelleyin)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3kd04k2u9XdVDD1-vdbQQAsHNW6WLIn8bNYxTlVCL3U1a0WqZo6oPp9zfBWIpwJEinQ/exec";

// --- OYUN DEĞİŞKENLERİ ---
let jokers = { call: 1, half: 1, double: 1 };
let doubleChanceUsed = false;
let firstAnswerIndex = -1;
let pScore = 0, pBalls = 10, pCurrentQ = null;

const VALID_CATEGORIES = ['Teknik', 'İkna', 'Kampanya', 'Bilgi'];
const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// --- GLOBAL DEĞİŞKENLER ---
let database = [], newsData = [], sportsData = [], salesScripts = [], quizQuestions = [];
let currentUser = "";
let isAdminMode = false;    // YETKİ
let isEditingActive = false;    // GÖRÜNÜM
let sessionTimeout;
let activeCards = [];
let currentCategory = 'all';
let adminUserList = [];
let allEvaluationsData = []; // Tüm kalite verisi burada tutulur
let wizardStepsData = {};
let qualityChartInstance = null;

// --- KALİTE PUANLAMA LOGİĞİ (Slider) ---
window.updateRowScore = function(index, max) {
    const slider = document.getElementById(`slider-${index}`);
    const badge = document.getElementById(`badge-${index}`);
    const noteInput = document.getElementById(`note-${index}`);
    const row = document.getElementById(`row-${index}`);
    if(!slider) return;
    
    const val = parseInt(slider.value);
    badge.innerText = val;
    
    // Görsel değişimler
    if (val < max) {
        if(noteInput) noteInput.style.display = 'block';
        badge.style.background = '#d32f2f'; // Kırmızı
        if(row) {
            row.style.borderColor = '#ffcdd2';
            row.style.background = '#fff5f5';
        }
    } else {
        if(noteInput) {
            noteInput.style.display = 'none';
            noteInput.value = ''; // Puan tamsa notu sil
        }
        badge.style.background = '#2e7d32'; // Yeşil
        if(row) {
            row.style.borderColor = '#eee';
            row.style.background = '#fff';
        }
    }
    window.recalcTotalScore();
};

window.recalcTotalScore = function() {
    let currentTotal = 0;
    let maxTotal = 0;
    const sliders = document.querySelectorAll('.slider-input');
    sliders.forEach(s => {
        currentTotal += parseInt(s.value) || 0;
        // Max değerini slider'ın özelliğinden dinamik alıyoruz
        maxTotal += parseInt(s.getAttribute('max')) || 0;
    });
    const liveScoreEl = document.getElementById('live-score');
    const ringEl = document.getElementById('score-ring');
    if(liveScoreEl) liveScoreEl.innerText = currentTotal;
    if(ringEl) {
        let color = '#2e7d32';
        // Oran hesapla (Maksimum puana göre)
        let ratio = maxTotal > 0 ? (currentTotal / maxTotal) * 100 : 0;
        if(ratio < 50) color = '#d32f2f';
        else if(ratio < 85) color = '#ed6c02';
        else if(ratio < 95) color = '#fabb00';
        ringEl.style.background = `conic-gradient(${color} ${ratio}%, #444 ${ratio}%)`;
    }
};

// --- YARDIMCI FONKSİYONLAR ---
function getToken() { return localStorage.getItem("sSportToken"); }
function getFavs() { return JSON.parse(localStorage.getItem('sSportFavs') || '[]'); }
function toggleFavorite(title) {
    event.stopPropagation();
    let favs = getFavs();
    if (favs.includes(title)) {
        favs = favs.filter(t => t !== title);
    } else {
        favs.push(title);
    }
    localStorage.setItem('sSportFavs', JSON.stringify(favs));
    // Eğer favoriler sekmesindeysek anlık güncelle
    if (currentCategory === 'fav') {
        const btn = document.querySelector('.btn-fav');
        if(btn) filterCategory(btn, 'fav');
    } else {
        // Kartın üzerindeki yıldızı güncellemek için render
        renderCards(activeCards);
    }
}
function isFav(title) { return getFavs().includes(title); }
function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return 'N/A';
    if (dateString.match(/^\d{2}\.\d{2}\.\d{4}/)) { return dateString; }
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) { return dateString; }
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    } catch (e) { return dateString; }
}
function isNew(dateStr) {
    if (!dateStr) return false;
    let date;
    if (dateStr.indexOf('.') > -1) {
        const cleanDate = dateStr.split(' ')[0];
        const parts = cleanDate.split('.');
        date = new Date(parts[2], parts[1] - 1, parts[0]);
    } else {
        date = new Date(dateStr);
    }
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
}
function getCategorySelectHtml(currentCategory, id) {
    let options = VALID_CATEGORIES.map(cat => `<option value="${cat}" ${cat === currentCategory ? 'selected' : ''}>${cat}</option>`).join('');
    if (currentCategory && !VALID_CATEGORIES.includes(currentCategory)) {
        options = `<option value="${currentCategory}" selected>${currentCategory} (Hata)</option>` + options;
    }
    return `<select id="${id}" class="swal2-input" style="width:100%; margin-top:5px;">${options}</select>`;
}
function escapeForJsString(text) {
    if (!text) return "";
    return text.toString().replace(/\\/g, '\\\\').replace(/'/g, '\\\'').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
}
document.addEventListener('contextmenu', event => event.preventDefault());
document.onkeydown = function(e) { if(e.keyCode == 123) return false; }
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
});

// --- SESSION & LOGIN ---
function checkSession() {
    const savedUser = localStorage.getItem("sSportUser");
    const savedToken = localStorage.getItem("sSportToken");
    const savedRole = localStorage.getItem("sSportRole");
    if (savedUser && savedToken) {
        currentUser = savedUser;
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("user-display").innerText = currentUser;
        checkAdmin(savedRole);
        startSessionTimer();
        if (BAKIM_MODU)
            document.getElementById("maintenance-screen").style.display = "flex";
        else {
            document.getElementById("main-app").style.display = "block";
            loadContentData();
            loadWizardData();
        }
    }
}
function enterBas(e) { if (e.key === "Enter") girisYap(); }
function girisYap() {
    const uName = document.getElementById("usernameInput").value.trim();
    const uPass = document.getElementById("passInput").value.trim();
    const loadingMsg = document.getElementById("loading-msg");
    const errorMsg = document.getElementById("error-msg");
    if(!uName || !uPass) {
        errorMsg.innerText = "Lütfen bilgileri giriniz.";
        errorMsg.style.display = "block";
        return;
    }
    loadingMsg.style.display = "block";
    loadingMsg.innerText = "Doğrulanıyor...";
    errorMsg.style.display = "none";
    document.querySelector('.login-btn').disabled = true;
    const hashedPass = CryptoJS.SHA256(uPass).toString();
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "login", username: uName, password: hashedPass })
    }).then(response => response.json())
    .then(data => {
        loadingMsg.style.display = "none";
        document.querySelector('.login-btn').disabled = false;
        if (data.result === "success") {
            currentUser = data.username;
            localStorage.setItem("sSportUser", currentUser);
            localStorage.setItem("sSportToken", data.token);
            localStorage.setItem("sSportRole", data.role);
            if (data.forceChange === true) {
                Swal.fire({
                    icon: 'warning',
                    title: '  ⚠️   Güvenlik Uyarısı',
                    text: 'İlk girişiniz. Lütfen şifrenizi değiştirin.',
                    allowOutsideClick: false,
                    allowEscapeKey: false,
                    confirmButtonText: 'Şifremi Değiştir'
                }).then(() => { changePasswordPopup(true); });
            } else {
                document.getElementById("login-screen").style.display = "none";
                document.getElementById("user-display").innerText = currentUser;
                checkAdmin(data.role);
                startSessionTimer();
                if (BAKIM_MODU)
                    document.getElementById("maintenance-screen").style.display = "flex";
                else {
                    document.getElementById("main-app").style.display = "block";
                    loadContentData();
                    loadWizardData();
                }
            }
        } else {
            errorMsg.innerText = data.message || "Hatalı giriş!";
            errorMsg.style.display = "block";
        }
    }).catch(error => {
        console.error("Login Error:", error);
        loadingMsg.style.display = "none";
        document.querySelector('.login-btn').disabled = false;
        errorMsg.innerText = "Sunucu hatası! Lütfen sayfayı yenileyin.";
        errorMsg.style.display = "block";
    });
}
function checkAdmin(role) {
    const addCardDropdown = document.getElementById('dropdownAddCard');
    const quickEditDropdown = document.getElementById('dropdownQuickEdit');
    isAdminMode = (role === "admin");
    isEditingActive = false;
    document.body.classList.remove('editing');
    if(isAdminMode) {
        if(addCardDropdown) addCardDropdown.style.display = 'flex';
        if(quickEditDropdown) {
            quickEditDropdown.style.display = 'flex';
            quickEditDropdown.innerHTML = '<i class="fas fa-pen" style="color:var(--secondary);"></i> Düzenlemeyi Aç';
            quickEditDropdown.classList.remove('active');
        }
    } else {
        if(addCardDropdown) addCardDropdown.style.display = 'none';
        if(quickEditDropdown) quickEditDropdown.style.display = 'none';
    }
}
function logout() {
    currentUser = "";
    isAdminMode = false;
    isEditingActive = false;
    document.body.classList.remove('editing');
    localStorage.removeItem("sSportUser");
    localStorage.removeItem("sSportToken");
    localStorage.removeItem("sSportRole");
    if (sessionTimeout) clearTimeout(sessionTimeout);
    location.reload();
}
function startSessionTimer() {
    if (sessionTimeout) clearTimeout(sessionTimeout);
    sessionTimeout = setTimeout(() => {
        Swal.fire({ icon: 'warning', title: 'Oturum Süresi Doldu', text: 'Güvenlik nedeniyle otomatik çıkış yapıldı.', confirmButtonText: 'Tamam' }).then(() => { logout(); });
    }, 3600000);
}
function openUserMenu() {
    let options = {
        title: `Merhaba, ${currentUser}`,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '  🔑   Şifre Değiştir',
        denyButtonText: '  🚪   Çıkış Yap',
        cancelButtonText: 'İptal'
    };
    Swal.fire(options).then((result) => {
        if (result.isConfirmed) changePasswordPopup();
        else if (result.isDenied) logout();
    });
}
async function changePasswordPopup(isMandatory = false) {
    const { value: formValues } = await Swal.fire({
        title: isMandatory ? 'Yeni Şifre Belirleyin' : 'Şifre Değiştir',
        html: `${isMandatory ? '<p style="font-size:0.9rem; color:#d32f2f;">İlk giriş şifrenizi değiştirmeden devam edemezsiniz.</p>' : ''}<input id="swal-old-pass" type="password" class="swal2-input" placeholder="Eski Şifre (Mevcut)"><input id="swal-new-pass" type="password" class="swal2-input" placeholder="Yeni Şifre">`,
        focusConfirm: false,
        showCancelButton: !isMandatory,
        allowOutsideClick: !isMandatory,
        allowEscapeKey: !isMandatory,
        confirmButtonText: 'Değiştir',
        cancelButtonText: 'İptal',
        preConfirm: () => {
            const o = document.getElementById('swal-old-pass').value;
            const n = document.getElementById('swal-new-pass').value;
            if(!o || !n) { Swal.showValidationMessage('Alanlar boş bırakılamaz'); }
            return [ o, n ]
        }
    });
    if (formValues) {
        Swal.fire({ title: 'İşleniyor...', didOpen: () => { Swal.showLoading() } });
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                action: "changePassword",
                username: currentUser,
                oldPass: CryptoJS.SHA256(formValues[0]).toString(),
                newPass: CryptoJS.SHA256(formValues[1]).toString(),
                token: getToken()
            })
        })
        .then(response => response.json())
        .then(data => {
            if(data.result === "success") {
                Swal.fire('Başarılı!', 'Şifreniz güncellendi. Güvenlik gereği yeniden giriş yapınız.', 'success').then(() => { logout(); });
            } else {
                Swal.fire('Hata', data.message || 'İşlem başarısız.', 'error').then(() => { if(isMandatory) changePasswordPopup(true); });
            }
        }).catch(err => {
            Swal.fire('Hata', 'Sunucu hatası.', 'error');
            if(isMandatory) changePasswordPopup(true);
        });
    } else if (isMandatory) {
        changePasswordPopup(true);
    }
}

// --- DATA FETCHING ---
function loadContentData() {
    document.getElementById('loading').style.display = 'block';
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "fetchData" })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById('loading').style.display = 'none';
        if (data.result === "success") {
            const rawData = data.data;
            // Verileri Type alanına göre ayır
            const fetchedCards = rawData.filter(i => ['card','bilgi','teknik','kampanya','ikna'].includes(i.Type.toLowerCase())).map(i => ({
                title: i.Title,
                category: i.Category,
                text: i.Text,
                script: i.Script,
                code: i.Code,
                link: i.Link,
                date: formatDateToDDMMYYYY(i.Date)
            }));
            const fetchedNews = rawData.filter(i => i.Type.toLowerCase() === 'news').map(i => ({
                date: formatDateToDDMMYYYY(i.Date),
                title: i.Title,
                desc: i.Text,
                type: i.Category,
                status: i.Status
            }));
            const fetchedSports = rawData.filter(i => i.Type.toLowerCase() === 'sport').map(i => ({
                title: i.Title,
                icon: i.Icon,
                desc: i.Text,
                tip: i.Tip,
                detail: i.Detail,
                pronunciation: i.Pronunciation
            }));
            const fetchedSales = rawData.filter(i => i.Type.toLowerCase() === 'sales').map(i => ({
                title: i.Title,
                text: i.Text
            }));
            const fetchedQuiz = rawData.filter(i => i.Type.toLowerCase() === 'quiz').map(i => ({
                q: i.Text,
                opts: i.QuizOptions ? i.QuizOptions.split(',').map(o => o.trim()) : [],
                a: parseInt(i.QuizAnswer)
            }));
            database = fetchedCards;
            newsData = fetchedNews;
            sportsData = fetchedSports;
            salesScripts = fetchedSales;
            quizQuestions = fetchedQuiz;
            if(currentCategory === 'fav') {
                const btn = document.querySelector('.btn-fav');
                if(btn) filterCategory(btn, 'fav');
            } else {
                activeCards = database;
                renderCards(database);
            }
            startTicker();
        } else {
            document.getElementById('loading').innerHTML = `Veriler alınamadı: ${data.message || 'Bilinmeyen Hata'}`;
        }
    })
    .catch(error => {
        console.error("Fetch Hatası:", error);
        document.getElementById('loading').innerHTML = 'Bağlantı Hatası! Sunucuya ulaşılamıyor.';
    });
}
function loadWizardData() {
    return new Promise((resolve, reject) => {
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getWizardData" })
        })
        .then(response => response.json())
        .then(data => {
            if (data.result === "success" && data.steps) {
                wizardStepsData = data.steps;
                console.log("Wizard Adımları Yüklendi:", Object.keys(wizardStepsData).length);
                resolve();
            } else {
                console.error("Wizard verisi yüklenemedi:", data.message);
                wizardStepsData = {};
                reject(new Error("Wizard verisi yüklenemedi."));
            }
        })
        .catch(error => {
            console.error("Wizard Fetch Hatası:", error);
            wizardStepsData = {};
            reject(error);
        });
    });
}

// --- RENDER & FILTERING ---
function renderCards(data) {
    activeCards = data;
    const container = document.getElementById('cardGrid');
    container.innerHTML = '';
    if (data.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#777;">Kayıt bulunamadı.</div>';
        return;
    }
    data.forEach((item, index) => {
        const safeTitle = escapeForJsString(item.title);
        const isFavorite = isFav(item.title);
        const favClass = isFavorite ? 'fas fa-star active' : 'far fa-star';
        const newBadge = isNew(item.date) ? '<span class="new-badge">YENİ</span>' : '';
        const editIconHtml = (isAdminMode && isEditingActive)
        ? `<i class="fas fa-pencil-alt edit-icon" onclick="editContent(${index})"></i>`
        : '';
        let rawText = item.text || "";
        let formattedText = rawText.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<b>$1</b>');
        let html = `<div class="card ${item.category}">${newBadge}
        <div class="icon-wrapper">
        ${editIconHtml}
        <i class="${favClass} fav-icon" onclick="toggleFavorite('${safeTitle}')"></i>
        </div>
        <div class="card-header"><h3 class="card-title">${highlightText(item.title)}</h3><span class="badge">${item.category}</span></div>
        <div class="card-content" onclick="showCardDetail('${safeTitle}', '${escapeForJsString(item.text)}')">
        <div class="card-text-truncate">${highlightText(formattedText)}</div>
        <div style="font-size:0.8rem; color:#999; margin-top:5px; text-align:right;">(Tamamını oku)</div>
        </div>
        <div class="script-box">${highlightText(item.script)}</div>
        <div class="card-actions">
        <button class="btn btn-copy" onclick="copyText('${escapeForJsString(item.script)}')"><i class="fas fa-copy"></i> Kopyala</button>
        ${item.code ? `<button class="btn btn-copy" style="background:var(--secondary); color:#333;" onclick="copyText('${escapeForJsString(item.code)}')">Kod</button>` : ''}
        ${item.link ? `<a href="${item.link}" target="_blank" class="btn btn-link"><i class="fas fa-external-link-alt"></i> Link</a>` : ''}
        </div>
        </div>`;
        container.innerHTML += html;
    });
}
function highlightText(htmlContent) {
    if (!htmlContent) return "";
    const searchTerm = document.getElementById('searchInput').value.trim();
    if (!searchTerm) return htmlContent;
    try {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        return htmlContent.toString().replace(regex, '<span class="highlight">$1</span>');
    } catch(e) {
        return htmlContent;
    }
}
function filterCategory(btn, cat) {
    currentCategory = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterContent();
}
function filterContent() {
    const search = document.getElementById('searchInput').value.toLocaleLowerCase('tr-TR').trim();
    let filtered = database;
    if (currentCategory === 'fav') {
        filtered = filtered.filter(i => isFav(i.title));
    } else if (currentCategory !== 'all') {
        filtered = filtered.filter(i => i.category === currentCategory);
    }
    if (search) {
        filtered = filtered.filter(item => {
            const title = (item.title || "").toString().toLocaleLowerCase('tr-TR');
            const text = (item.text || "").toString().toLocaleLowerCase('tr-TR');
            const script = (item.script || "").toString().toLocaleLowerCase('tr-TR');
            const code = (item.code || "").toString().toLocaleLowerCase('tr-TR');
            return title.includes(search) || text.includes(search) || script.includes(search) || code.includes(search);
        });
    }
    activeCards = filtered;
    renderCards(filtered);
}
function showCardDetail(title, text) {
    Swal.fire({
        title: title,
        html: `<div style="text-align:left; font-size:1rem; line-height:1.6;">${text.replace(/\\n/g,'<br>')}</div>`,
        showCloseButton: true,
        showConfirmButton: false,
        width: '600px',
        background: '#f8f9fa'
    });
}
function copyText(t) {
    navigator.clipboard.writeText(t.replace(/\\n/g, '\n')).then(() =>
    Swal.fire({icon:'success', title:'Kopyalandı', toast:true, position:'top-end', showConfirmButton:false, timer:1500}) );
}
function toggleEditMode() {
    if (!isAdminMode) return;
    isEditingActive = !isEditingActive;
    document.body.classList.toggle('editing', isEditingActive);
    const btn = document.getElementById('dropdownQuickEdit');
    if(isEditingActive) {
        btn.classList.add('active');
        btn.innerHTML = '<i class="fas fa-times" style="color:var(--accent);"></i> Düzenlemeyi Kapat';
        Swal.fire({ icon: 'success', title: 'Düzenleme Modu AÇIK', text: 'Kalem ikonlarına tıklayarak içerikleri düzenleyebilirsiniz.', timer: 1500, showConfirmButton: false });
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<i class="fas fa-pen" style="color:var(--secondary);"></i> Düzenlemeyi Aç';
    }
    filterContent();
    if(document.getElementById('guide-modal').style.display === 'flex') openGuide();
    if(document.getElementById('sales-modal').style.display === 'flex') openSales();
    if(document.getElementById('news-modal').style.display === 'flex') openNews();
}
function sendUpdate(o, c, v, t='card') {
    if (!Swal.isVisible()) Swal.fire({ title: 'Kaydediliyor...', didOpen: () => { Swal.showLoading() } });
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: "updateContent", title: o, column: c, value: v, type: t, originalText: o, username: currentUser, token: getToken() })
    }).then(r => r.json())
    .then(data => {
        if (data.result === "success") {
            Swal.fire({icon: 'success', title: 'Başarılı', timer: 1500, showConfirmButton: false});
            setTimeout(loadContentData, 1600);
        } else {
            Swal.fire('Hata', 'Kaydedilemedi: ' + (data.message || 'Bilinmeyen Hata'), 'error');
        }
    }).catch(err => Swal.fire('Hata', 'Sunucu hatası.', 'error'));
}

// --- CRUD OPERASYONLARI ---
async function addNewCardPopup() {
    const catSelectHTML = getCategorySelectHtml('Bilgi', 'swal-new-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Yeni İçerik Ekle',
        html: `
        <div style="margin-bottom:15px; text-align:left;">
        <label style="font-weight:bold; font-size:0.9rem;">Ne Ekleyeceksin?</label>
        <select id="swal-type-select" class="swal2-input" style="width:100%; margin-top:5px; height:35px; font-size:0.9rem;" onchange="toggleAddFields()">
        <option value="card">  📌   Bilgi Kartı</option>
        <option value="news">  📢   Duyuru</option>
        <option value="sales">  📞   Telesatış Scripti</option>
        <option value="sport">  🏆   Spor İçeriği</option>
        <option value="quiz">  ❓   Quiz Sorusu</option>
        </select>
        </div>
        <div id="preview-card" class="card Bilgi" style="text-align:left; box-shadow:none; border:1px solid #e0e0e0; margin-top:10px;">
        <div class="card-header" style="align-items: center; gap: 10px;">
        <input id="swal-new-title" class="swal2-input" style="margin:0; height:40px; flex-grow:1; border:none; border-bottom:2px solid #eee; padding:0 5px; font-weight:bold; color:#0e1b42;" placeholder="Başlık Giriniz...">
        <div id="cat-container" style="width: 110px;">${catSelectHTML}</div>
        </div>
        <div class="card-content" style="margin-bottom:10px;">
        <textarea id="swal-new-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:100px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni..."></textarea>
        </div>
        <div id="script-container" class="script-box" style="padding:0; border:1px solid #f0e68c;">
        <textarea id="swal-new-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni (İsteğe bağlı)..."></textarea>
        </div>
        <div id="extra-container" class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-new-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" placeholder="Kod"></div>
        <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-new-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" placeholder="Link"></div>
        </div>
        <div id="sport-extra" style="display:none; padding:10px;">
        <label style="font-weight:bold;">Kısa Açıklama (Desc)</label><input id="swal-sport-tip" class="swal2-input" placeholder="Kısa İpucu/Tip">
        <label style="font-weight:bold;">Detaylı Metin (Detail)</label><input id="swal-sport-detail" class="swal2-input" placeholder="Detaylı Açıklama (Alt Metin)">
        <label style="font-weight:bold;">Okunuşu (Pronunciation)</label><input id="swal-sport-pron" class="swal2-input" placeholder="Okunuşu">
        <label style="font-weight:bold;">İkon Sınıfı (Icon)</label><input id="swal-sport-icon" class="swal2-input" placeholder="FontAwesome İkon Sınıfı (e.g., fa-futbol)">
        </div>
        <div id="news-extra" style="display:none; padding:10px;">
        <label style="font-weight:bold;">Duyuru Tipi</label><select id="swal-news-type" class="swal2-input"><option value="info">Bilgi</option><option value="update">Değişiklik</option><option value="fix">Çözüldü</option></select>
        <label style="font-weight:bold;">Durum</label><select id="swal-news-status" class="swal2-input"><option value="Aktif">Aktif</option><option value="Pasif">Pasif (Gizle)</option></select>
        </div>
        <div id="quiz-extra" style="display:none; padding:10px;">
        <label style="font-weight:bold;">Soru Metni (Text)</label><textarea id="swal-quiz-q" class="swal2-textarea" placeholder="Quiz sorusu..."></textarea>
        <label style="font-weight:bold;">Seçenekler (Virgülle Ayırın)</label><input id="swal-quiz-opts" class="swal2-input" placeholder="Örn: şık A,şık B,şık C,şık D">
        <label style="font-weight:bold;">Doğru Cevap İndeksi</label><input id="swal-quiz-ans" type="number" class="swal2-input" placeholder="0 (A), 1 (B), 2 (C) veya 3 (D)" min="0" max="3">
        </div>
        </div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-plus"></i> Ekle',
        cancelButtonText: 'İptal',
        focusConfirm: false,
        didOpen: () => {
            const selectEl = document.getElementById('swal-new-cat');
            const cardEl = document.getElementById('preview-card');
            if(selectEl) {
                selectEl.style.margin = "0"; selectEl.style.height = "30px"; selectEl.style.fontSize = "0.8rem"; selectEl.style.padding = "0 5px";
                selectEl.addEventListener('change', function() { cardEl.className = 'card ' + this.value; });
            }
            window.toggleAddFields = function() {
                const type = document.getElementById('swal-type-select').value;
                const catCont = document.getElementById('cat-container');
                const scriptCont = document.getElementById('script-container');
                const extraCont = document.getElementById('extra-container');
                const sportExtra = document.getElementById('sport-extra');
                const newsExtra = document.getElementById('news-extra');
                const quizExtra = document.getElementById('quiz-extra');
                const cardPreview = document.getElementById('preview-card');
                catCont.style.display = 'none'; scriptCont.style.display = 'none'; extraCont.style.display = 'none';
                sportExtra.style.display = 'none'; newsExtra.style.display = 'none'; quizExtra.style.display = 'none';
                document.getElementById('swal-new-title').value = '';
                document.getElementById('swal-new-text').value = '';
                cardPreview.style.borderLeft = "5px solid var(--info)";
                cardPreview.className = 'card Bilgi';
                if (type === 'card') {
                    catCont.style.display = 'block'; scriptCont.style.display = 'block'; extraCont.style.display = 'grid';
                    cardPreview.className = 'card ' + document.getElementById('swal-new-cat').value;
                    document.getElementById('swal-new-title').placeholder = "Başlık Giriniz...";
                    document.getElementById('swal-new-text').placeholder = "İçerik metni...";
                } else if (type === 'sales') {
                    scriptCont.style.display = 'block';
                    document.getElementById('swal-new-script').placeholder = "Satış Metni...";
                    cardPreview.style.borderLeft = "5px solid var(--sales)";
                    document.getElementById('swal-new-title').placeholder = "Script Başlığı...";
                    document.getElementById('swal-new-text').placeholder = "Sadece buraya metin girilecek.";
                } else if (type === 'sport') {
                    sportExtra.style.display = 'block';
                    cardPreview.style.borderLeft = "5px solid var(--primary)";
                    document.getElementById('swal-new-title').placeholder = "Spor Terimi Başlığı...";
                    document.getElementById('swal-new-text').placeholder = "Kısa Açıklama (Desc)...";
                } else if (type === 'news') {
                    newsExtra.style.display = 'block';
                    cardPreview.style.borderLeft = "5px solid var(--secondary)";
                    document.getElementById('swal-new-title').placeholder = "Duyuru Başlığı...";
                    document.getElementById('swal-new-text').placeholder = "Duyuru Metni (Desc)...";
                } else if (type === 'quiz') {
                    quizExtra.style.display = 'block';
                    document.getElementById('swal-new-title').placeholder = "Quiz Başlığı (Örn: Soru 1)";
                    document.getElementById('swal-new-text').placeholder = "Bu alan boş bırakılacak.";
                    cardPreview.style.borderLeft = "5px solid var(--quiz)";
                }
            };
        },
        preConfirm: () => {
            const type = document.getElementById('swal-type-select').value;
            const today = new Date();
            const dateStr = today.getDate() + "." + (today.getMonth()+1) + "." + today.getFullYear();
            const quizOpts = type === 'quiz' ? document.getElementById('swal-quiz-opts').value : '';
            const quizAns = type === 'quiz' ? document.getElementById('swal-quiz-ans').value : '';
            const quizQ = type === 'quiz' ? document.getElementById('swal-quiz-q').value : '';
            if (type === 'quiz' && (!quizQ || !quizOpts || quizAns === '')) {
                Swal.showValidationMessage('Quiz sorusu için tüm alanlar zorunludur.');
                return false;
            }
            return {
                cardType: type,
                category: type === 'card' ? document.getElementById('swal-new-cat').value : (type === 'news' ? document.getElementById('swal-news-type').value : ''),
                title: document.getElementById('swal-new-title').value,
                text: type === 'quiz' ? quizQ : document.getElementById('swal-new-text').value,
                script: (type === 'card' || type === 'sales') ? document.getElementById('swal-new-script').value : '',
                code: type === 'card' ? document.getElementById('swal-new-code').value : '',
                status: type === 'news' ? document.getElementById('swal-news-status').value : '',
                link: type === 'card' ? document.getElementById('swal-new-link').value : '',
                tip: type === 'sport' ? document.getElementById('swal-sport-tip').value : '',
                detail: type === 'sport' ? document.getElementById('swal-sport-detail').value : '',
                pronunciation: type === 'sport' ? document.getElementById('swal-sport-pron').value : '',
                icon: type === 'sport' ? document.getElementById('swal-sport-icon').value : '',
                date: dateStr,
                quizOptions: quizOpts,
                quizAnswer: quizAns
            }
        }
    });
    
    if (formValues) {
        if(!formValues.title) { Swal.fire('Hata', 'Başlık zorunlu!', 'error'); return; }
        Swal.fire({ title: 'Ekleniyor...', didOpen: () => { Swal.showLoading() } });
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "addCard", username: currentUser, token: getToken(), ...formValues })
        })
        .then(response => response.json()).then(data => {
            if (data.result === "success") {
                Swal.fire({icon: 'success', title: 'Başarılı', text: 'İçerik eklendi.', timer: 2000, showConfirmButton: false});
                setTimeout(loadContentData, 3500);
            } else {
                Swal.fire('Hata', data.message || 'Eklenemedi.', 'error');
            }
        }).catch(err => Swal.fire('Hata', 'Sunucu hatası: ' + err, 'error'));
    }
}

async function editContent(index) {
    const item = activeCards[index];
    const catSelectHTML = getCategorySelectHtml(item.category, 'swal-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Kartı Düzenle',
        html: `
        <div id="preview-card-edit" class="card ${item.category}" style="text-align:left; box-shadow:none; border:1px solid #e0e0e0; margin-top:10px;">
        <div class="card-header" style="align-items: center; gap: 10px;">
        <input id="swal-title" class="swal2-input" style="margin:0; height:40px; flex-grow:1; border:none; border-bottom:2px solid #eee; padding:0 5px; font-weight:bold; color:#0e1b42;" value="${item.title}" placeholder="Başlık">
        <div style="width: 110px;">${catSelectHTML}</div>
        </div>
        <div class="card-content" style="margin-bottom:10px;">
        <textarea id="swal-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:120px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni...">${(item.text || '').toString().replace(/<br>/g,'\n')}</textarea>
        </div>
        <div class="script-box" style="padding:0; border:1px solid #f0e68c;">
        <textarea id="swal-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni...">${(item.script || '').toString().replace(/<br>/g,'\n')}</textarea>
        </div>
        <div class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.code || ''}" placeholder="Kod"></div>
        <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.link || ''}" placeholder="Link"></div>
        </div>
        </div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-save"></i> Değişiklikleri Kaydet',
        cancelButtonText: 'İptal',
        focusConfirm: false,
        preConfirm: () => {
            return {
                cat: document.getElementById('swal-cat').value,
                title: document.getElementById('swal-title').value,
                text: document.getElementById('swal-text').value,
                script: document.getElementById('swal-script').value,
                code: document.getElementById('swal-code').value,
                link: document.getElementById('swal-link').value
            }
        }
    });
    if (formValues) {
        if(formValues.cat !== item.category) sendUpdate(item.title, "Category", formValues.cat, 'card');
        if(formValues.text !== (item.text || '').replace(/<br>/g,'\n')) setTimeout(() => sendUpdate(item.title, "Text", formValues.text, 'card'), 500);
        if(formValues.script !== (item.script || '').replace(/<br>/g,'\n')) setTimeout(() => sendUpdate(item.title, "Script", formValues.script, 'card'), 1000);
        if(formValues.code !== (item.code || '')) setTimeout(() => sendUpdate(item.title, "Code", formValues.code, 'card'), 1500);
        if(formValues.link !== (item.link || '')) setTimeout(() => sendUpdate(item.title, "Link", formValues.link, 'card'), 2000);
        if(formValues.title !== item.title) setTimeout(() => sendUpdate(item.title, "Title", formValues.title, 'card'), 2500);
    }
}

async function editSport(title) {
    event.stopPropagation();
    const s = sportsData.find(item => item.title === title);
    if (!s) return Swal.fire('Hata', 'İçerik bulunamadı.', 'error');
    const { value: formValues } = await Swal.fire({
        title: 'Spor İçeriğini Düzenle',
        html: `
        <div class="card" style="text-align:left; border-left: 5px solid var(--primary); padding:15px; background:#f8f9fa;">
        <label style="font-weight:bold;">Başlık</label>
        <input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.title}">
        <label style="font-weight:bold;">Açıklama (Kısa Metin)</label>
        <textarea id="swal-desc" class="swal2-textarea" style="margin-bottom:10px;">${s.desc || ''}</textarea>
        <label style="font-weight:bold;">İpucu (Tip)</label>
        <input id="swal-tip" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.tip || ''}">
        <label style="font-weight:bold;">Detay (Alt Metin)</label>
        <textarea id="swal-detail" class="swal2-textarea" style="margin-bottom:10px;">${s.detail || ''}</textarea>
        <label style="font-weight:bold;">Okunuş</label>
        <input id="swal-pron" class="swal2-input" style="width:100%; margin-bottom:10px;" value="${s.pronunciation || ''}">
        <label style="font-weight:bold;">İkon Sınıfı</label>
        <input id="swal-icon" class="swal2-input" style="width:100%;" value="${s.icon || ''}">
        </div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        preConfirm: () => [
            document.getElementById('swal-title').value,
            document.getElementById('swal-desc').value,
            document.getElementById('swal-tip').value,
            document.getElementById('swal-detail').value,
            document.getElementById('swal-pron').value,
            document.getElementById('swal-icon').value
        ]
    });
    if (formValues) {
        const originalTitle = s.title;
        if(formValues[1] !== s.desc) sendUpdate(originalTitle, "Text", formValues[1], 'sport');
        if(formValues[2] !== s.tip) setTimeout(() => sendUpdate(originalTitle, "Tip", formValues[2], 'sport'), 500);
        if(formValues[3] !== s.detail) setTimeout(() => sendUpdate(originalTitle, "Detail", formValues[3], 'sport'), 1000);
        if(formValues[4] !== s.pronunciation) setTimeout(() => sendUpdate(originalTitle, "Pronunciation", formValues[4], 'sport'), 1500);
        if(formValues[5] !== s.icon) setTimeout(() => sendUpdate(originalTitle, "Icon", formValues[5], 'sport'), 2000);
        if(formValues[0] !== originalTitle) setTimeout(() => sendUpdate(originalTitle, "Title", formValues[0], 'sport'), 2500);
    }
}

async function editSales(title) {
    event.stopPropagation();
    const s = salesScripts.find(item => item.title === title);
    if (!s) return Swal.fire('Hata', 'İçerik bulunamadı.', 'error');
    const { value: formValues } = await Swal.fire({
        title: 'Satış Metnini Düzenle',
        html: `<div class="card" style="text-align:left; border-left: 5px solid var(--sales); padding:15px; background:#ecfdf5;"><label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;"
        value="${s.title}"><label style="font-weight:bold;">Metin</label><textarea id="swal-text" class="swal2-textarea" style="min-height:150px;">${s.text || ''}</textarea></div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        preConfirm: () => [ document.getElementById('swal-title').value, document.getElementById('swal-text').value ]
    });
    if (formValues) {
        const originalTitle = s.title;
        if(formValues[1] !== s.text) sendUpdate(originalTitle, "Text", formValues[1], 'sales');
        if(formValues[0] !== originalTitle) setTimeout(() => sendUpdate(originalTitle, "Title", formValues[0], 'sales'), 500);
    }
}

async function editNews(index) {
    const i = newsData[index];
    let statusOptions = `<option value="Aktif" ${i.status !== 'Pasif' ? 'selected' : ''}>Aktif</option><option value="Pasif" ${i.status === 'Pasif' ?
    'selected' : ''}>Pasif (Gizle)</option>`;
    let typeOptions = `<option value="info" ${i.type === 'info' ? 'selected' : ''}>Bilgi</option><option value="update" ${i.type === 'update' ?
    'selected' : ''}>Değişiklik</option><option value="fix" ${i.type === 'fix' ? 'selected' : ''}>Çözüldü</option>`;
    const { value: formValues } = await Swal.fire({
        title: 'Duyuruyu Düzenle',
        html: `<div class="card" style="text-align:left; border-left: 5px solid var(--secondary); padding:15px; background:#fff8e1;"><label style="font-weight:bold;">Başlık</label><input id="swal-title" class="swal2-input" style="width:100%; margin-bottom:10px;"
        value="${i.title || ''}"><div style="display:flex; gap:10px; margin-bottom:10px;"><div style="flex:1;"><label style="font-weight:bold;">Tarih</label><input id="swal-date" class="swal2-input" style="width:100%;"
        value="${i.date || ''}"></div><div style="flex:1;"><label style="font-weight:bold;">Tür</label><select id="swal-type" class="swal2-input" style="width:100%;">${typeOptions}</select></div></div><label style="font-weight:bold;">Metin</label><textarea id="swal-desc" class="swal2-textarea" style="margin-bottom:10px;">${i.desc || ''}</textarea><label style="font-weight:bold;">Durum</label><select id="swal-status" class="swal2-input" style="width:100%;">${statusOptions}</select></div>`,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        preConfirm: () => [
            document.getElementById('swal-title').value,
            document.getElementById('swal-date').value,
            document.getElementById('swal-desc').value,
            document.getElementById('swal-type').value,
            document.getElementById('swal-status').value
        ]
    });
    if (formValues) {
        const originalTitle = i.title;
        if(formValues[1] !== i.date) sendUpdate(originalTitle, "Date", formValues[1], 'news');
        if(formValues[2] !== i.desc) setTimeout(() => sendUpdate(originalTitle, "Text", formValues[2], 'news'), 500);
        if(formValues[3] !== i.type) setTimeout(() => sendUpdate(originalTitle, "Category", formValues[3], 'news'), 1000);
        if(formValues[4] !== i.status) setTimeout(() => sendUpdate(originalTitle, "Status", formValues[4], 'news'), 1500);
        if(formValues[0] !== originalTitle) setTimeout(() => sendUpdate(originalTitle, "Title", formValues[0], 'news'), 2000);
    }
}

// --- MODALS ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
let tickerIndex = 0;
function startTicker() {
    const t = document.getElementById('ticker-content');
    const activeNews = newsData.filter(i => i.status !== 'Pasif');
    if(activeNews.length === 0) {
        t.innerHTML = "Güncel duyuru yok.";
        t.style.animation = 'none'; 
        return;
    }
    let tickerText = activeNews.map(i => {
        return `<span style="color:#fabb00; font-weight:bold;">[${i.date}]</span> <span style="color:#fff;">${i.title}:</span> <span style="color:#ddd;">${i.desc}</span>`;
    }).join(' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ');
    t.innerHTML = tickerText + ' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ' + tickerText + ' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ' + tickerText;
    t.style.animation = 'ticker-scroll 90s linear infinite';
}

function openNews() {
    document.getElementById('news-modal').style.display = 'flex';
    const c = document.getElementById('news-container');
    c.innerHTML = '';
    newsData.forEach((i, index) => {
        let cl = i.type === 'fix' ? 'tag-fix' : (i.type === 'update' ? 'tag-update' : 'tag-info');
        let tx = i.type === 'fix' ? 'Çözüldü' : (i.type === 'update' ? 'Değişiklik' : 'Bilgi');
        let passiveStyle = i.status === 'Pasif' ? 'opacity:0.5; background:#eee;' : '';
        let passiveBadge = i.status === 'Pasif' ? '<span class="news-tag" style="background:#555; color:white;">PASİF</span>' : '';
        let editBtn = (isAdminMode && isEditingActive)
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:0; right:0; font-size:0.9rem; padding:4px;" onclick="event.stopPropagation(); editNews(${index})"></i>`
            : '';
        c.innerHTML += `<div class="news-item" style="${passiveStyle}">${editBtn}<span class="news-date">${i.date}</span><span class="news-title">${i.title} ${passiveBadge}</span><div class="news-desc">${i.desc}</div><span class="news-tag ${cl}">${tx}</span></div>`;
    });
}

function openGuide() {
    document.getElementById('guide-modal').style.display = 'flex';
    const grid = document.getElementById('guide-grid');
    grid.innerHTML = '';
    sportsData.forEach((s, index) => {
        let pronHtml = s.pronunciation ? `<div class="pronunciation-badge">  🗣️   ${s.pronunciation}</div>` : '';
        let editBtn = (isAdminMode && isEditingActive)
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:5px; right:5px; z-index:50;" onclick="event.stopPropagation(); editSport('${escapeForJsString(s.title)}')"></i>`
            : '';
        grid.innerHTML += `<div class="guide-item" onclick="showSportDetail(${index})">${editBtn}<i class="fas ${s.icon} guide-icon"></i><span class="guide-title">${s.title}</span>${pronHtml}<div class="guide-desc">${s.desc}</div><div class="guide-tip"><i class="fas fa-lightbulb"></i> ${s.tip}</div><div style="font-size:0.8rem; color:#999; margin-top:5px;">(Detay için tıkla)</div></div>`;
    });
}

function showSportDetail(index) {
    const sport = sportsData[index];
    const detailText = sport.detail ? sport.detail.replace(/\n/g,'<br>') : "Bu içerik için henüz detay eklenmemiş.";
    const pronDetail = sport.pronunciation ? `<div style="color:#e65100; font-weight:bold; margin-bottom:15px;">  🗣️   Okunuşu: ${sport.pronunciation}</div>` : '';
    Swal.fire({
        title: `<i class="fas ${sport.icon}" style="color:#0e1b42;"></i> ${sport.title}`,
        html: `${pronDetail}<div style="text-align:left; font-size:1rem; line-height:1.6;">${detailText}</div>`,
        showCloseButton: true,
        showConfirmButton: false,
        width: '600px',
        background: '#f8f9fa'
    });
}

function openSales() {
    document.getElementById('sales-modal').style.display = 'flex';
    const c = document.getElementById('sales-grid');
    c.innerHTML = '';
    salesScripts.forEach((s, index) => {
        let editBtn = (isAdminMode && isEditingActive)
            ? `<i class="fas fa-pencil-alt edit-icon" style="top:10px; right:40px; z-index:50;" onclick="event.stopPropagation(); editSales('${escapeForJsString(s.title)}')"></i>`
            : '';
        c.innerHTML += `<div class="sales-item" id="sales-${index}" onclick="toggleSales('${index}')">${editBtn}<div class="sales-header"><span class="sales-title">${s.title}</span><i class="fas fa-chevron-down" id="icon-${index}" style="color:#10b981;"></i></div><div class="sales-text">${(s.text || '').replace(/\n/g,'<br>')}<div style="text-align:right; margin-top:15px;"><button class="btn btn-copy" onclick="event.stopPropagation(); copyText('${escapeForJsString(s.text || '')}')"><i class="fas fa-copy"></i> Kopyala</button></div></div></div>`;
    });
}

function toggleSales(index) {
    const item = document.getElementById(`sales-${index}`);
    const icon = document.getElementById(`icon-${index}`);
    item.classList.toggle('active');
    if(item.classList.contains('active')){
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
}

// --- YENİLENMİŞ KALİTE DASHBOARD (TAM VE HATASIZ) ---
function openQualityArea() {
    document.getElementById('quality-modal').style.display = 'flex';
    document.getElementById('admin-quality-controls').style.display = isAdminMode ? 'flex' : 'none';
    
    // Ay Filtresi Doldur
    const selectEl = document.getElementById('month-select-filter');
    selectEl.innerHTML = '';
    const now = new Date();
    for (let i = 0; i < 6; i++) {
        let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        let val = `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
        let txt = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        selectEl.add(new Option(txt, val));
    }
    
    // Grup Filtresi Doldur (Sadece Admin)
    const groupSelect = document.getElementById('group-select-filter');
    if(groupSelect) {
        groupSelect.innerHTML = '<option value="all">Tüm Gruplar</option>';
        groupSelect.style.display = isAdminMode ? 'block' : 'none';
    }

    if (isAdminMode) {
        fetchUserListForAdmin().then(users => {
            // 1. Grupları doldur
            const groups = [...new Set(users.map(u => u.group).filter(g => g))];
            groups.forEach(g => {
                const opt = document.createElement('option');
                opt.value = g; opt.textContent = g;
                groupSelect.appendChild(opt);
            });

            // 2. İlk başta "Tüm Temsilciler"i doldur
            populateAgentSelect(users);
            
            // 3. TÜM VERİYİ ÇEK (Admin için 'all')
            fetchEvaluationsForAgent('all');
        });
    } else {
        // Normal kullanıcı sadece kendi verisi
        fetchEvaluationsForAgent(currentUser);
    }
}

function populateAgentSelect(users) {
    const selectEl = document.getElementById('agent-select-admin');
    selectEl.innerHTML = `<option value="all">-- Tüm Temsilciler --</option>` +
        users.map(u => `<option value="${u.name}" data-group="${u.group}">${u.name} (${u.group})</option>`).join('');
}

function filterAgentsByGroup() {
    const selectedGroup = document.getElementById('group-select-filter').value;
    let filteredUsers = adminUserList;
    
    if (selectedGroup !== 'all') {
        filteredUsers = adminUserList.filter(u => u.group === selectedGroup);
    }
    
    populateAgentSelect(filteredUsers);
    // Grubu değiştirdiğinde, UI'ı o gruba göre güncelle (API çağrısı yapmadan, çünkü tüm veri zaten var)
    updateDashboardUI();
}

function fetchEvaluationsForAgent(forcedName) {
    const listEl = document.getElementById('evaluations-list-dashboard');
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;"><i class="fas fa-circle-notch fa-spin"></i> Veriler yükleniyor...</div>';
    
    // Admin ise HER ZAMAN 'all' çekiyoruz ki sıralama yapabilelim. Filtrelemeyi JS tarafında yapacağız.
    let targetRequest = isAdminMode ? 'all' : currentUser;
    
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "fetchEvaluations", targetAgent: targetRequest, username: currentUser, token: getToken() })
    }).then(r => r.json()).then(data => {
        if (data.result === "success") {
            allEvaluationsData = data.evaluations;
            updateDashboardUI();
        } else {
            listEl.innerHTML = '<div style="text-align:center; color:red;">Veri alınamadı.</div>';
        }
    }).catch(err => {
        listEl.innerHTML = '<div style="text-align:center; color:red;">Bağlantı hatası.</div>';
    });
}

function updateDashboardUI() {
    const monthFilter = document.getElementById('month-select-filter').value;
    const selectedGroup = isAdminMode ? document.getElementById('group-select-filter').value : null;
    const selectedAgent = isAdminMode ? document.getElementById('agent-select-admin').value : currentUser;
    
    // 1. ADIM: Önce AY'a ve GRUBA göre filtrele (Sıralama Tablosu için)
    const groupData = allEvaluationsData.filter(item => {
        if(!item.date) return false;
        const parts = item.date.split('.'); 
        const isMonthMatch = (parts.length >= 3 && `${parts[1]}.${parts[2]}` === monthFilter);
        if (!isMonthMatch) return false;

        if (isAdminMode && selectedGroup && selectedGroup !== 'all') {
            let itemGroup = item.group;
            if (!itemGroup && adminUserList.length > 0) {
                const u = adminUserList.find(u => u.name === (item.agent || item.agentName));
                if(u) itemGroup = u.group;
            }
            return itemGroup === selectedGroup;
        }
        return true;
    });

    // 2. ADIM: Sıralama Tablosunu Oluştur
    updateRankingTable(groupData, selectedAgent);

    // 3. ADIM: Şimdi SEÇİLİ TEMSİLCİYE göre filtrele (Sol Liste ve Kartlar için)
    let displayedData = groupData;
    if (selectedAgent && selectedAgent !== 'all') {
        displayedData = groupData.filter(item => (item.agent === selectedAgent || item.agentName === selectedAgent));
    }

    // 4. ADIM: Kartları ve Sol Listeyi Güncelle
    updateKPIsAndList(displayedData, displayedData.length);
}

function updateRankingTable(data, activeAgentName) {
    const rankBody = document.getElementById('group-ranking-body');
    rankBody.innerHTML = '';
    const groupNameEl = document.getElementById('ranking-group-name');
    
    if (isAdminMode) {
        const grp = document.getElementById('group-select-filter').value;
        groupNameEl.innerText = grp === 'all' ? '(Tümü)' : `(${grp})`;
    } else {
        const myRec = data.find(d => d.agent === currentUser || d.agentName === currentUser);
        groupNameEl.innerText = myRec ? `(${myRec.group})` : '';
    }

    if (data.length === 0) {
        rankBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">Veri yok.</td></tr>';
        return;
    }

    // Kişi bazlı grupla
    let stats = {};
    data.forEach(d => {
        let name = d.agent || d.agentName;
        if (!stats[name]) stats[name] = { total: 0, count: 0 };
        stats[name].total += (parseInt(d.score) || 0);
        stats[name].count++;
    });

    // Ortalamaya göre sırala
    let ranking = Object.keys(stats).map(key => ({
        name: key,
        avg: (stats[key].total / stats[key].count).toFixed(1)
    })).sort((a, b) => b.avg - a.avg);

    // Tabloyu yaz
    ranking.forEach((r, idx) => {
        let icon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx+1}`));
        let style = (r.name === activeAgentName) ? 'background-color:#fff9c4; font-weight:bold;' : '';
        
        rankBody.innerHTML += `
            <tr style="border-bottom:1px solid #eee; ${style}">
                <td style="padding:8px;">${icon}</td>
                <td style="padding:8px;">${r.name}</td>
                <td style="padding:8px; text-align:right;">${r.avg}</td>
            </tr>
        `;
    });
}

function updateKPIsAndList(data, totalCount) {
    // İstatistikler
    let totalScore = 0;
    let scores = data.map(i => parseInt(i.score) || 0);
    if (totalCount > 0) totalScore = scores.reduce((a, b) => a + b, 0);

    const avg = totalCount > 0 ? (totalScore / totalCount).toFixed(1) : 0;
    const targetRate = totalCount > 0 ? ((scores.filter(s => s >= 90).length / totalCount) * 100).toFixed(0) : 0;

    document.getElementById('dash-total-score').innerText = avg;
    document.getElementById('dash-total-score').style.color = avg >= 90 ? 'var(--success)' : (avg >= 80 ? 'var(--warning)' : 'var(--accent)');
    document.getElementById('dash-total-count').innerText = totalCount;
    document.getElementById('dash-target-rate').innerText = `%${targetRate}`;

    // Sol Liste (Detaylı)
    const listEl = document.getElementById('evaluations-list-dashboard');
    listEl.innerHTML = '';

    if (totalCount === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#ccc;">Kayıt bulunamadı.</div>';
    } else {
        // Yeniden eskiye
        data.slice().reverse().forEach(item => {
            let badgeClass = item.score >= 90 ? 'score-green' : (item.score >= 70 ? 'score-yellow' : 'score-red');
            let agentName = item.agent || item.agentName;
            let callDate = item.callDate || item.date; 

            let html = `
                <div class="dash-list-item" onclick="showEvaluationDetail('${item.callId}')">
                    <div style="display:flex; align-items:center; gap:10px; width:50%;">
                        <div style="width:35px; height:35px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#64748b; font-weight:bold;">
                            ${agentName.charAt(0)}
                        </div>
                        <div>
                            <div style="font-weight:bold; color:#334155; font-size:0.9rem;">${agentName}</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">ID: ${item.callId || '-'}</div>
                        </div>
                    </div>
                    <div style="font-size:0.8rem; color:#64748b;">${callDate}</div>
                    <div>
                        <span class="dash-score-badge ${badgeClass}">${item.score}</span>
                    </div>
                </div>`;
            listEl.innerHTML += html;
        });
    }
    
    // Grafik Varsa Güncelle (Grafik kütüphanesi ekliyse)
    const ctx = document.getElementById('qualityChart');
    if(ctx) {
        const chartCtx = ctx.getContext('2d');
        if(qualityChartInstance) qualityChartInstance.destroy();
        
        // Grafiği soldan sağa çizmek için tarih sıralaması
        const sortedForChart = data.slice().sort((a,b) => {
            let da = a.date.split('.').reverse().join('');
            let db = b.date.split('.').reverse().join('');
            return da.localeCompare(db);
        });
        
        qualityChartInstance = new Chart(chartCtx, {
            type: 'line',
            data: {
                labels: sortedForChart.map(d => d.date.split('.').slice(0,2).join('/')),
                datasets: [{
                    label: 'Kalite Puanı',
                    data: sortedForChart.map(d => d.score),
                    borderColor: '#3B82F6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#3B82F6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: {display:false} },
                scales: { y: { min:0, max:100, grid:{color:'#f0f0f0'} }, x: { grid:{display:false} } }
            }
        });
    }
}

// --- GÜZELLEŞTİRİLMİŞ DETAY POPUP ---
function showEvaluationDetail(callId) {
    const item = allEvaluationsData.find(i => i.callId == callId);
    if (!item) return;

    let detailHtml = '';
    try {
        const details = JSON.parse(item.details);
        detailHtml = '<div style="margin-top:10px; border-top:1px solid #eee;">';
        details.forEach(d => {
            let scoreColor = d.score < d.max ? '#dc2626' : '#16a34a'; 
            let noteHtml = d.note ? `<div style="font-size:0.75rem; color:#dc2626; margin-top:2px; font-style:italic;">⚠️ ${d.note}</div>` : '';
            detailHtml += `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; padding:10px 0; border-bottom:1px solid #f1f5f9;">
                    <div style="width:85%; font-size:0.9rem; color:#334155;">
                        ${d.q}
                        ${noteHtml}
                    </div>
                    <div style="font-weight:800; font-size:0.95rem; color:${scoreColor}; white-space:nowrap;">
                        ${d.score} / ${d.max}
                    </div>
                </div>
            `;
        });
        detailHtml += '</div>';
    } catch(e) {
        detailHtml = `<p>${item.details}</p>`;
    }

    let editBtn = isAdminMode ? `<button onclick="editEvaluation('${item.callId}')" class="swal2-confirm swal2-styled" style="background-color:#0e1b42; margin-top:10px;">Düzenle</button>` : '';

    Swal.fire({
        title: `<strong>Detaylar (ID: ${item.callId})</strong>`,
        html: `
            <div style="text-align:left;">
                <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:10px;">
                    <div>
                        <span style="font-size:0.8rem; color:#64748b; display:block;">Değerlendirme Tarihi</span>
                        <strong style="color:#0f172a;">${item.date}</strong>
                    </div>
                    <div>
                        <span style="font-size:0.8rem; color:#64748b; display:block;">Çağrı Tarihi</span>
                        <strong style="color:#0f172a;">${item.callDate || '-'}</strong>
                    </div>
                    <div style="text-align:right;">
                        <span style="font-size:1.5rem; font-weight:900; color:${item.score>=90?'#16a34a':(item.score>=70?'#ca8a04':'#dc2626')}">${item.score} Puan</span>
                    </div>
                </div>
                ${detailHtml}
                <div style="margin-top:15px; background:#eff6ff; padding:12px; border-radius:8px; border-left:4px solid #3b82f6;">
                    <strong style="color:#1e40af; font-size:0.85rem;">Geri Bildirim:</strong>
                    <p style="margin:5px 0 0 0; font-size:0.9rem; color:#334155;">${item.feedback || 'Geri bildirim girilmemiş.'}</p>
                </div>
                <div style="text-align:right; margin-top:10px;">${editBtn}</div>
            </div>
        `,
        width: '700px',
        showConfirmButton: false,
        showCloseButton: true
    });
}

// --- CRUD Ekleme/Düzenleme ---
async function addNewCardPopup() {
    const catSelectHTML = getCategorySelectHtml('Bilgi', 'swal-new-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Yeni İçerik Ekle',
        html: `
        <div style="margin-bottom:15px; text-align:left;">
        <label style="font-weight:bold; font-size:0.9rem;">Ne Ekleyeceksin?</label>
        <select id="swal-type-select" class="swal2-input" style="width:100%; margin-top:5px; height:35px; font-size:0.9rem;" onchange="toggleAddFields()">
        <option value="card">📌 Bilgi Kartı</option>
        <option value="news">📢 Duyuru</option>
        <option value="sales">📞 Telesatış Scripti</option>
        <option value="sport">🏆 Spor İçeriği</option>
        <option value="quiz">❓ Quiz Sorusu</option>
        </select>
        </div>
        <div id="preview-card" class="card Bilgi" style="text-align:left; box-shadow:none; border:1px solid #e0e0e0; margin-top:10px;">
        <div class="card-header" style="align-items: center; gap: 10px;">
        <input id="swal-new-title" class="swal2-input" style="margin:0; height:40px; flex-grow:1; border:none; border-bottom:2px solid #eee; padding:0 5px; font-weight:bold; color:#0e1b42;" placeholder="Başlık Giriniz...">
        <div id="cat-container" style="width: 110px;">${catSelectHTML}</div>
        </div>
        <div class="card-content" style="margin-bottom:10px;">
        <textarea id="swal-new-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:100px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni..."></textarea>
        </div>
        <div id="script-container" class="script-box" style="padding:0; border:1px solid #f0e68c;">
        <textarea id="swal-new-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni (İsteğe bağlı)..."></textarea>
        </div>
        <div id="extra-container" class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-new-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" placeholder="Kod"></div>
        <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-new-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" placeholder="Link"></div>
        </div>
        <div id="sport-extra" style="display:none; padding:10px;">
        <label style="font-weight:bold;">Kısa Açıklama (Desc)</label><input id="swal-sport-tip" class="swal2-input" placeholder="Kısa İpucu/Tip">
        <label style="font-weight:bold;">Detaylı Metin (Detail)</label><input id="swal-sport-detail" class="swal2-input" placeholder="Detaylı Açıklama (Alt Metin)">
        <label style="font-weight:bold;">Okunuşu (Pronunciation)</label><input id="swal-sport-pron" class="swal2-input" placeholder="Okunuşu">
        <label style="font-weight:bold;">İkon Sınıfı (Icon)</label><input id="swal-sport-icon" class="swal2-input" placeholder="FontAwesome İkon Sınıfı">
        </div>
        <div id="news-extra" style="display:none; padding:10px;">
        <label style="font-weight:bold;">Duyuru Tipi</label><select id="swal-news-type" class="swal2-input"><option value="info">Bilgi</option><option value="update">Değişiklik</option><option value="fix">Çözüldü</option></select>
        <label style="font-weight:bold;">Durum</label><select id="swal-news-status" class="swal2-input"><option value="Aktif">Aktif</option><option value="Pasif">Pasif (Gizle)</option></select>
        </div>
        <div id="quiz-extra" style="display:none; padding:10px;">
        <label style="font-weight:bold;">Soru Metni (Text)</label><textarea id="swal-quiz-q" class="swal2-textarea" placeholder="Quiz sorusu..."></textarea>
        <label style="font-weight:bold;">Seçenekler (Virgülle Ayırın)</label><input id="swal-quiz-opts" class="swal2-input" placeholder="Örn: şık A,şık B,şık C,şık D">
        <label style="font-weight:bold;">Doğru Cevap İndeksi</label><input id="swal-quiz-ans" type="number" class="swal2-input" placeholder="0-3 arası rakam" min="0" max="3">
        </div>
        </div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: '<i class="fas fa-plus"></i> Ekle',
        cancelButtonText: 'İptal',
        focusConfirm: false,
        didOpen: () => {
            const selectEl = document.getElementById('swal-new-cat');
            const cardEl = document.getElementById('preview-card');
            if(selectEl) {
                selectEl.style.margin = "0"; selectEl.style.height = "30px"; selectEl.style.fontSize = "0.8rem"; selectEl.style.padding = "0 5px";
                selectEl.addEventListener('change', function() { cardEl.className = 'card ' + this.value; });
            }
            window.toggleAddFields = function() {
                const type = document.getElementById('swal-type-select').value;
                document.getElementById('cat-container').style.display = type === 'card' ? 'block' : 'none';
                document.getElementById('script-container').style.display = (type === 'card' || type === 'sales') ? 'block' : 'none';
                document.getElementById('extra-container').style.display = type === 'card' ? 'grid' : 'none';
                document.getElementById('sport-extra').style.display = type === 'sport' ? 'block' : 'none';
                document.getElementById('news-extra').style.display = type === 'news' ? 'block' : 'none';
                document.getElementById('quiz-extra').style.display = type === 'quiz' ? 'block' : 'none';
            };
        },
        preConfirm: () => {
            // Form verilerini toplama
            const type = document.getElementById('swal-type-select').value;
            const today = new Date();
            const dateStr = today.getDate() + "." + (today.getMonth()+1) + "." + today.getFullYear();
            return {
                cardType: type,
                category: type === 'card' ? document.getElementById('swal-new-cat').value : (type === 'news' ? document.getElementById('swal-news-type').value : ''),
                title: document.getElementById('swal-new-title').value,
                text: type === 'quiz' ? document.getElementById('swal-quiz-q').value : document.getElementById('swal-new-text').value,
                script: (type === 'card' || type === 'sales') ? document.getElementById('swal-new-script').value : '',
                code: type === 'card' ? document.getElementById('swal-new-code').value : '',
                status: type === 'news' ? document.getElementById('swal-news-status').value : '',
                link: type === 'card' ? document.getElementById('swal-new-link').value : '',
                tip: type === 'sport' ? document.getElementById('swal-sport-tip').value : '',
                detail: type === 'sport' ? document.getElementById('swal-sport-detail').value : '',
                pronunciation: type === 'sport' ? document.getElementById('swal-sport-pron').value : '',
                icon: type === 'sport' ? document.getElementById('swal-sport-icon').value : '',
                date: dateStr,
                quizOptions: type === 'quiz' ? document.getElementById('swal-quiz-opts').value : '',
                quizAnswer: type === 'quiz' ? document.getElementById('swal-quiz-ans').value : ''
            };
        }
    });
    
    if (formValues) {
        if(!formValues.title) { Swal.fire('Hata', 'Başlık zorunlu!', 'error'); return; }
        Swal.fire({ title: 'Ekleniyor...', didOpen: () => { Swal.showLoading() } });
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "addCard", username: currentUser, token: getToken(), ...formValues })
        }).then(r => r.json()).then(data => {
            if (data.result === "success") {
                Swal.fire({icon: 'success', title: 'Başarılı', timer: 1500, showConfirmButton: false});
                setTimeout(loadContentData, 1600);
            } else { Swal.fire('Hata', data.message || 'Eklenemedi.', 'error'); }
        });
    }
}

async function editContent(index) {
    const item = activeCards[index];
    const catSelectHTML = getCategorySelectHtml(item.category, 'swal-cat');
    const { value: formValues } = await Swal.fire({
        title: 'Kartı Düzenle',
        html: `
        <div id="preview-card-edit" class="card ${item.category}" style="text-align:left; box-shadow:none; border:1px solid #e0e0e0; margin-top:10px;">
        <div class="card-header" style="align-items: center; gap: 10px;">
        <input id="swal-title" class="swal2-input" style="margin:0; height:40px; flex-grow:1; border:none; border-bottom:2px solid #eee; padding:0 5px; font-weight:bold; color:#0e1b42;" value="${item.title}" placeholder="Başlık">
        <div style="width: 110px;">${catSelectHTML}</div>
        </div>
        <div class="card-content" style="margin-bottom:10px;">
        <textarea id="swal-text" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; resize:none; font-family:inherit; min-height:120px; padding:10px; background:#f9f9f9;" placeholder="İçerik metni...">${(item.text || '').toString().replace(/<br>/g,'\n')}</textarea>
        </div>
        <div class="script-box" style="padding:0; border:1px solid #f0e68c;">
        <textarea id="swal-script" class="swal2-textarea" style="margin:0; width:100%; box-sizing:border-box; border:none; background:transparent; font-style:italic; min-height:80px; font-size:0.9rem;" placeholder="Script metni...">${(item.script || '').toString().replace(/<br>/g,'\n')}</textarea>
        </div>
        <div class="card-actions" style="margin-top:15px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div style="position:relative;"><i class="fas fa-code" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-code" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.code || ''}" placeholder="Kod"></div>
        <div style="position:relative;"><i class="fas fa-link" style="position:absolute; left:10px; top:10px; color:#aaa;"></i><input id="swal-link" class="swal2-input" style="margin:0; height:35px; font-size:0.85rem; padding-left:30px;" value="${item.link || ''}" placeholder="Link"></div>
        </div>
        </div>`,
        width: '700px',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        preConfirm: () => {
            return {
                cat: document.getElementById('swal-cat').value,
                title: document.getElementById('swal-title').value,
                text: document.getElementById('swal-text').value,
                script: document.getElementById('swal-script').value,
                code: document.getElementById('swal-code').value,
                link: document.getElementById('swal-link').value
            }
        }
    });
    if (formValues) {
        if(formValues.cat !== item.category) sendUpdate(item.title, "Category", formValues.cat, 'card');
        if(formValues.text !== (item.text || '').replace(/<br>/g,'\n')) setTimeout(() => sendUpdate(item.title, "Text", formValues.text, 'card'), 500);
        if(formValues.script !== (item.script || '').replace(/<br>/g,'\n')) setTimeout(() => sendUpdate(item.title, "Script", formValues.script, 'card'), 1000);
        if(formValues.code !== (item.code || '')) setTimeout(() => sendUpdate(item.title, "Code", formValues.code, 'card'), 1500);
        if(formValues.link !== (item.link || '')) setTimeout(() => sendUpdate(item.title, "Link", formValues.link, 'card'), 2000);
        if(formValues.title !== item.title) setTimeout(() => sendUpdate(item.title, "Title", formValues.title, 'card'), 2500);
    }
}

async function editSport(title) {
    event.stopPropagation();
    const s = sportsData.find(item => item.title === title);
    if (!s) return;
    const { value: formValues } = await Swal.fire({
        title: 'Spor İçeriğini Düzenle',
        html: `
        <input id="swal-title" class="swal2-input" value="${s.title}" placeholder="Başlık">
        <textarea id="swal-desc" class="swal2-textarea" placeholder="Açıklama">${s.desc || ''}</textarea>
        <input id="swal-tip" class="swal2-input" value="${s.tip || ''}" placeholder="İpucu">
        <textarea id="swal-detail" class="swal2-textarea" placeholder="Detay">${s.detail || ''}</textarea>
        <input id="swal-pron" class="swal2-input" value="${s.pronunciation || ''}" placeholder="Okunuş">
        <input id="swal-icon" class="swal2-input" value="${s.icon || ''}" placeholder="İkon">`,
        confirmButtonText: 'Kaydet',
        preConfirm: () => [
            document.getElementById('swal-title').value,
            document.getElementById('swal-desc').value,
            document.getElementById('swal-tip').value,
            document.getElementById('swal-detail').value,
            document.getElementById('swal-pron').value,
            document.getElementById('swal-icon').value
        ]
    });
    if (formValues) {
        if(formValues[1] !== s.desc) sendUpdate(s.title, "Text", formValues[1], 'sport');
        if(formValues[0] !== s.title) setTimeout(() => sendUpdate(s.title, "Title", formValues[0], 'sport'), 1000);
    }
}

async function editSales(title) {
    event.stopPropagation();
    const s = salesScripts.find(item => item.title === title);
    if (!s) return;
    const { value: formValues } = await Swal.fire({
        title: 'Satış Metnini Düzenle',
        html: `<input id="swal-title" class="swal2-input" value="${s.title}"><textarea id="swal-text" class="swal2-textarea">${s.text || ''}</textarea>`,
        confirmButtonText: 'Kaydet',
        preConfirm: () => [ document.getElementById('swal-title').value, document.getElementById('swal-text').value ]
    });
    if (formValues) {
        if(formValues[1] !== s.text) sendUpdate(s.title, "Text", formValues[1], 'sales');
    }
}

async function editNews(index) {
    const i = newsData[index];
    const { value: formValues } = await Swal.fire({
        title: 'Duyuruyu Düzenle',
        html: `<input id="swal-title" class="swal2-input" value="${i.title}"><input id="swal-date" class="swal2-input" value="${i.date}"><textarea id="swal-desc" class="swal2-textarea">${i.desc}</textarea>`,
        confirmButtonText: 'Kaydet',
        preConfirm: () => [ document.getElementById('swal-title').value, document.getElementById('swal-date').value, document.getElementById('swal-desc').value ]
    });
    if (formValues) {
        if(formValues[2] !== i.desc) sendUpdate(i.title, "Text", formValues[2], 'news');
    }
}

// --- MODALS ---
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
let tickerIndex = 0;
function startTicker() {
    const t = document.getElementById('ticker-content');
    const activeNews = newsData.filter(i => i.status !== 'Pasif');
    if(activeNews.length === 0) {
        t.innerHTML = "Güncel duyuru yok.";
        t.style.animation = 'none'; 
        return;
    }
    let tickerText = activeNews.map(i => {
        return `<span style="color:#fabb00; font-weight:bold;">[${i.date}]</span> <span style="color:#fff;">${i.title}:</span> <span style="color:#ddd;">${i.desc}</span>`;
    }).join(' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ');
    t.innerHTML = tickerText + ' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ' + tickerText + ' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ' + tickerText;
    t.style.animation = 'ticker-scroll 90s linear infinite';
}

function openNews() {
    document.getElementById('news-modal').style.display = 'flex';
    const c = document.getElementById('news-container');
    c.innerHTML = '';
    newsData.forEach((i, index) => {
        let editBtn = (isAdminMode && isEditingActive) ? `<i class="fas fa-pencil-alt edit-icon" onclick="event.stopPropagation(); editNews(${index})"></i>` : '';
        c.innerHTML += `<div class="news-item">${editBtn} <strong>${i.title}</strong><br>${i.desc}</div>`;
    });
}

function openGuide() {
    document.getElementById('guide-modal').style.display = 'flex';
    const grid = document.getElementById('guide-grid');
    grid.innerHTML = '';
    sportsData.forEach((s, index) => {
        let editBtn = (isAdminMode && isEditingActive) ? `<i class="fas fa-pencil-alt edit-icon" onclick="event.stopPropagation(); editSport('${escapeForJsString(s.title)}')"></i>` : '';
        grid.innerHTML += `<div class="guide-item" onclick="showSportDetail(${index})">${editBtn}<i class="fas ${s.icon} guide-icon"></i><div class="guide-title">${s.title}</div><div class="guide-desc">${s.desc}</div></div>`;
    });
}

function showSportDetail(index) {
    const s = sportsData[index];
    Swal.fire({ title: s.title, html: s.detail ? s.detail.replace(/\n/g,'<br>') : s.desc });
}

function openSales() {
    document.getElementById('sales-modal').style.display = 'flex';
    const c = document.getElementById('sales-grid');
    c.innerHTML = '';
    salesScripts.forEach((s, index) => {
        let editBtn = (isAdminMode && isEditingActive) ? `<i class="fas fa-pencil-alt edit-icon" onclick="event.stopPropagation(); editSales('${escapeForJsString(s.title)}')"></i>` : '';
        c.innerHTML += `<div class="sales-item" onclick="this.classList.toggle('active')">${editBtn}<div class="sales-header"><strong>${s.title}</strong><i class="fas fa-chevron-down"></i></div><div class="sales-text">${s.text}</div></div>`;
    });
}

// --- KALİTE DASHBOARD (YENİLENMİŞ KISIM) ---
function openQualityArea() {
    document.getElementById('quality-modal').style.display = 'flex';
    document.getElementById('admin-quality-controls').style.display = isAdminMode ? 'flex' : 'none';
    
    // Ay Filtresi
    const selectEl = document.getElementById('month-select-filter');
    selectEl.innerHTML = '';
    const now = new Date();
    for (let i = 0; i < 6; i++) {
        let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        let val = `${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
        let txt = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
        let opt = document.createElement('option'); opt.value = val; opt.textContent = txt;
        selectEl.appendChild(opt);
    }
    
    if (isAdminMode) {
        fetchUserListForAdmin().then(users => {
            const selectEl = document.getElementById('agent-select-admin');
            selectEl.innerHTML = `<option value="all" data-group="all">-- Tüm Temsilciler --</option>` +
            users.map(u => `<option value="${u.name}" data-group="${u.group}">${u.name} (${u.group})</option>`).join('');
            fetchEvaluationsForAgent('all');
        });
    } else {
        fetchEvaluationsForAgent(currentUser);
    }
}

function fetchEvaluationsForAgent(forcedName) {
    const listEl = document.getElementById('evaluations-list-dashboard');
    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#999;"><i class="fas fa-circle-notch fa-spin"></i> Veriler analiz ediliyor...</div>';
    
    let target = forcedName || (isAdminMode ? document.getElementById('agent-select-admin').value : currentUser);
    
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "fetchEvaluations", targetAgent: target, username: currentUser, token: getToken() })
    }).then(r => r.json()).then(data => {
        if (data.result === "success") {
            allEvaluationsData = data.evaluations;
            updateDashboardUI();
        } else {
            listEl.innerHTML = '<div style="text-align:center; color:red;">Veri alınamadı.</div>';
        }
    }).catch(err => {
        listEl.innerHTML = '<div style="text-align:center; color:red;">Sunucu hatası.</div>';
    });
}

function updateDashboardUI() {
    const monthFilter = document.getElementById('month-select-filter').value;
    const filtered = allEvaluationsData.filter(item => {
        if(!item.date) return false;
        const parts = item.date.split('.'); 
        return (parts.length >= 3 && `${parts[1]}.${parts[2]}` === monthFilter);
    });

    // İstatistikler
    let totalScore = 0, count = filtered.length;
    let scores = filtered.map(i => parseInt(i.score)||0);
    if (count > 0) totalScore = scores.reduce((a,b)=>a+b, 0);
    
    const avg = count > 0 ? (totalScore/count).toFixed(1) : 0;
    const targetRate = count > 0 ? ((scores.filter(s=>s>=90).length/count)*100).toFixed(0) : 0;

    document.getElementById('dash-total-score').innerText = avg;
    document.getElementById('dash-total-score').style.color = avg>=90 ? 'var(--success)' : (avg>=80 ? 'var(--warning)' : 'var(--accent)');
    
    document.getElementById('dash-total-count').innerText = count;
    document.getElementById('dash-target-rate').innerText = `%${targetRate}`;

    // LİSTELEME VE GRUP SIRALAMASI
    const listEl = document.getElementById('evaluations-list-dashboard');
    listEl.innerHTML = '';
    
    const rankBody = document.getElementById('group-ranking-body');
    rankBody.innerHTML = '';

    // SOL TARAF: ÇAĞRI LİSTESİ (FULL LİSTE)
    if(count === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#ccc;">Bu dönem kayıt yok.</div>';
    } else {
        const sortedList = filtered.slice().reverse();
        sortedList.forEach(item => {
            let badgeClass = item.score >= 90 ? 'score-green' : (item.score >= 70 ? 'score-yellow' : 'score-red');
            let html = `
                <div class="dash-list-item" onclick="showEvaluationDetail('${item.callId}')" style="cursor:pointer;">
                    <div>
                        <div style="font-weight:bold; color:#333;">${item.callId || 'ID Yok'}</div>
                        <div style="font-size:0.75rem; color:#999;">${item.date}</div>
                    </div>
                    <div>
                        <span class="dash-score-badge ${badgeClass}">${item.score}</span>
                        <i class="fas fa-chevron-right" style="font-size:0.8rem; color:#ccc; margin-left:10px;"></i>
                    </div>
                </div>`;
            listEl.innerHTML += html;
        });
    }

    // SAĞ TARAF: GRUP SIRALAMASI
    let rankingTargetGroup = ""; 
    if(isAdminMode) {
        const sel = document.getElementById('agent-select-admin');
        const opt = sel.options[sel.selectedIndex];
        if(opt) rankingTargetGroup = opt.getAttribute('data-group');
    } else {
        const myData = allEvaluationsData.find(d => d.agent === currentUser || d.agentName === currentUser);
        if(myData) rankingTargetGroup = myData.group; 
    }
    
    document.getElementById('ranking-group-name').innerText = rankingTargetGroup ? `(${rankingTargetGroup})` : '';

    if(!rankingTargetGroup) {
        rankBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">Grup bilgisi yok.</td></tr>';
    } else {
        const groupData = allEvaluationsData.filter(item => {
            if(!item.date) return false;
            const parts = item.date.split('.');
            const isMonth = (parts.length >= 3 && `${parts[1]}.${parts[2]}` === monthFilter);
            let itemGroup = item.group; 
            if(!itemGroup && adminUserList.length > 0) {
                const u = adminUserList.find(u => u.name === (item.agent || item.agentName));
                if(u) itemGroup = u.group;
            }
            return isMonth && itemGroup === rankingTargetGroup;
        });

        let agentStats = {};
        groupData.forEach(d => {
            let name = d.agent || d.agentName;
            if(!agentStats[name]) agentStats[name] = { total: 0, count: 0 };
            agentStats[name].total += (parseInt(d.score)||0);
            agentStats[name].count++;
        });

        let ranking = Object.keys(agentStats).map(name => {
            return {
                name: name,
                avg: (agentStats[name].total / agentStats[name].count).toFixed(1),
                count: agentStats[name].count
            };
        }).sort((a,b) => b.avg - a.avg);

        if(ranking.length === 0) {
            rankBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px; color:#999;">Veri yok.</td></tr>';
        } else {
            ranking.forEach((r, idx) => {
                let rankIcon = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx+1}`));
                let highlight = (r.name === (isAdminMode ? document.getElementById('agent-select-admin').value : currentUser)) ? 'background:#fff8e1;' : '';
                
                rankBody.innerHTML += `
                <tr style="border-bottom:1px solid #eee; ${highlight}">
                    <td style="padding:8px; font-weight:bold;">${rankIcon}</td>
                    <td style="padding:8px; font-size:0.8rem;">${r.name}</td>
                    <td style="padding:8px; text-align:right; font-weight:bold;">${r.avg}</td>
                </tr>`;
            });
        }
    }
}

// YENİ: Detay Görüntüleme Fonksiyonu
function showEvaluationDetail(callId) {
    const item = allEvaluationsData.find(i => i.callId == callId);
    if (!item) return;

    let detailHtml = '';
    try {
        const details = JSON.parse(item.details);
        detailHtml = '<table style="width:100%; text-align:left; font-size:0.9rem; border-collapse:collapse;">';
        details.forEach(d => {
            let color = d.score < d.max ? 'color:red;' : 'color:green;';
            detailHtml += `<tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px;">${d.q} <br><small style="color:#999;">${d.note || ''}</small></td>
                <td style="padding:8px; font-weight:bold; ${color}">${d.score}/${d.max}</td>
            </tr>`;
        });
        detailHtml += '</table>';
    } catch(e) {
        detailHtml = `<p>${item.details}</p>`;
    }

    let editBtn = isAdminMode ? `<button onclick="editEvaluation('${item.callId}')" style="margin-top:15px; padding:10px; width:100%; background:#0e1b42; color:white; border:none; border-radius:5px; cursor:pointer;"><i class="fas fa-edit"></i> Düzenle</button>` : '';

    Swal.fire({
        title: `Detaylar (ID: ${item.callId})`,
        html: `
            <div style="text-align:left;">
                <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                    <span><strong>Tarih:</strong> ${item.date}</span>
                    <span style="font-size:1.2rem; font-weight:bold; color:${item.score>=90?'green':'red'}">${item.score} Puan</span>
                </div>
                ${detailHtml}
                <div style="margin-top:15px; background:#f9f9f9; padding:10px; border-radius:5px;">
                    <strong>Geri Bildirim:</strong><br>${item.feedback || '-'}
                </div>
                ${editBtn}
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true
    });
}

function fetchUserListForAdmin() {
    return new Promise((resolve) => {
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getUserList", username: currentUser, token: getToken() })
        }).then(r => r.json()).then(data => {
            if (data.result === "success") {
                const filteredUsers = data.users.filter(u => u.group !== 'Yönetim');
                adminUserList = filteredUsers;
                resolve(filteredUsers);
            } else resolve([]);
        }).catch(() => resolve([]));
    });
}

function fetchCriteria(groupName) {
    return new Promise((resolve) => {
        fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getCriteria", group: groupName, username: currentUser, token: getToken() })
        }).then(r => r.json()).then(data => resolve(data.result==="success" ? data.criteria : [])).catch(() => resolve([]));
    });
}

// --- LOG EVALUATION & EDIT ---
async function logEvaluationPopup() {
    const selectEl = document.getElementById('agent-select-admin');
    const agentName = selectEl.value;
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    let agentGroup = selectedOption.getAttribute('data-group') || 'Genel';
    
    if (agentGroup === 'Chat') {
        const { value: selectedChatType } = await Swal.fire({
            title: 'Chat Form Tipi Seçin',
            input: 'radio',
            inputOptions: {'Chat-Normal': 'Chat - Normal İşlem', 'Chat-Teknik': 'Chat - Teknik Destek'},
            inputValidator: (value) => !value && 'Bir form tipi seçmelisiniz!',
            showCancelButton: true
        });
        if (!selectedChatType) return;
        agentGroup = selectedChatType;
    }
    
    Swal.fire({ title: 'Form Hazırlanıyor...', didOpen: () => Swal.showLoading() });
    
    let criteriaList = [];
    if(['Telesatış', 'Chat-Normal', 'Chat-Teknik'].includes(agentGroup)) { 
        criteriaList = await fetchCriteria(agentGroup);
    } 
    Swal.close();
    
    const isCriteriaBased = criteriaList.length > 0;
    
    let criteriaFieldsHtml = '';
    if (isCriteriaBased) {
        criteriaFieldsHtml += `<div class="criteria-container">`;
        criteriaList.forEach((c,i) => {
            let pts = parseInt(c.points) || 0;
            criteriaFieldsHtml += `
            <div class="criteria-row" id="row-${i}">
                <div class="criteria-header"><span>${i+1}. ${c.text}</span><span style="font-size:0.8rem; color:#999;">Max: ${pts}</span></div>
                <div class="criteria-controls">
                    <input type="range" class="custom-range slider-input" id="slider-${i}" min="0" max="${pts}" value="${pts}" data-index="${i}" oninput="updateRowScore(${i}, ${pts})">
                    <span class="score-badge" id="badge-${i}">${pts}</span>
                </div>
                <input type="text" id="note-${i}" class="note-input" placeholder="Kırılım nedeni..." style="display:none; margin-top:5px;">
            </div>`;
        });
        criteriaFieldsHtml += `</div>`;
    } else {
        criteriaFieldsHtml = `
        <div style="padding:15px; border:1px dashed #ccc; background:#fff; margin-bottom:15px; text-align:center;">
            <p style="color:#e65100; font-size:0.9rem;">(Otomatik kriter bulunamadı, manuel puanlama aktif)</p>
            <label style="font-weight:bold;">Puan</label><br>
            <input id="eval-manual-score" type="number" class="swal2-input" value="100" min="0" max="100" style="width:100px; text-align:center; font-size:1.5rem; font-weight:bold;">
        </div>
        <textarea id="eval-details" class="swal2-textarea" placeholder="Değerlendirme detayları..." style="margin-bottom:15px;"></textarea>`;
    }

    const { value: formValues } = await Swal.fire({
        title: 'Değerlendirme',
        html: `
        <div class="eval-modal-wrapper">
            <div class="score-dashboard" style="margin-bottom:10px;">
                 <div>
                    <div style="font-size:0.9rem; opacity:0.8;">Değerlendirilen</div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#fabb00;">${agentName}</div>
                    <div style="font-size:0.8rem; opacity:0.7;">${agentGroup}</div>
                 </div>
                 <div class="score-circle-outer" id="score-ring"><div class="score-circle-inner" id="live-score">${isCriteriaBased?'100':'100'}</div></div>
            </div>
            <div class="eval-header-card">
                <div><label style="font-size:0.8rem; font-weight:bold;">Call ID</label><input id="eval-callid" class="swal2-input" style="height:35px; margin:0; width:100%;" placeholder="ID"></div>
                <div><label style="font-size:0.8rem; font-weight:bold;">Tarih</label><input type="date" id="eval-calldate" class="swal2-input" style="height:35px; margin:0; width:100%;" value="${new Date().toISOString().split('T')[0]}"></div>
            </div>
            ${criteriaFieldsHtml}
            <div style="margin-top:15px; background:#fafafa; padding:10px; border:1px solid #eee;">
                <label style="font-size:0.85rem; font-weight:bold;">Geri Bildirim Tipi</label>
                <select id="feedback-type" class="swal2-input" style="width:100%; height:35px; margin-top:5px;"><option value="Yok">Geri Bildirim Yok</option><option value="Sözlü">Sözlü</option><option value="Mail">Mail</option></select>
            </div>
            <textarea id="eval-feedback" class="swal2-textarea" style="margin-top:10px; height:80px;" placeholder="Genel yorum..."></textarea>
        </div>`,
        width: '650px',
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        didOpen: () => { if(isCriteriaBased) window.recalcTotalScore(); },
        preConfirm: () => {
             const callId = document.getElementById('eval-callid').value;
             const callDateRaw = document.getElementById('eval-calldate').value;
             const feedback = document.getElementById('eval-feedback').value;
             const feedbackType = document.getElementById('feedback-type').value;
             if (!callId || !callDateRaw) { Swal.showValidationMessage('Call ID ve Tarih zorunludur.'); return false; }
             
             const dateParts = callDateRaw.split('-');
             const formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
             
             if (isCriteriaBased) {
                 let total = 0, detailsArr = [];
                 criteriaList.forEach((c, i) => {
                     let val = parseInt(document.getElementById(`slider-${i}`).value)||0;
                     let note = document.getElementById(`note-${i}`).value;
                     total += val;
                     detailsArr.push({ q: c.text, max: parseInt(c.points), score: val, note: note });
                 });
                 return { agentName, agentGroup, callId, callDate: formattedDate, score: total, details: JSON.stringify(detailsArr), feedback, feedbackType };
             } else {
                 const score = parseInt(document.getElementById('eval-manual-score').value);
                 const details = document.getElementById('eval-details').value;
                 return { agentName, agentGroup, callId, callDate: formattedDate, score, details, feedback, feedbackType };
             }
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Kaydediliyor...', didOpen: () => Swal.showLoading() });
        fetch(SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "logEvaluation", username: currentUser, token: getToken(), ...formValues })
        }).then(r=>r.json()).then(d => {
            if (d.result === "success") {
                Swal.fire({ icon: 'success', title: 'Kaydedildi', timer: 1500, showConfirmButton: false });
                fetchEvaluationsForAgent(agentName);
            } else Swal.fire('Hata', d.message, 'error');
        });
    }
}

// YENİ: DÜZENLEME FONKSİYONU (ESKİ MANTIK İLE)
async function editEvaluation(targetCallId) {
    const item = allEvaluationsData.find(i => i.callId == targetCallId);
    if (!item) return;
    
    // Admin yetkisi ve grup kontrolü
    const selectEl = document.getElementById('agent-select-admin');
    const agentName = item.agent || item.agentName || selectEl.value;
    
    let agentGroup = 'Genel'; // Varsayılan
    // Gruptan kriter çekmeye çalış (item içinde grup yoksa select'ten al)
    const selectedOption = Array.from(selectEl.options).find(opt => opt.value === agentName);
    if(selectedOption) agentGroup = selectedOption.getAttribute('data-group');
    
    Swal.fire({ title: 'Veriler Alınıyor...', didOpen: () => Swal.showLoading() });
    
    let criteriaList = [];
    if(['Telesatış', 'Chat-Normal', 'Chat-Teknik'].includes(agentGroup)) { 
        criteriaList = await fetchCriteria(agentGroup);
    }
    Swal.close();
    
    const isCriteriaBased = criteriaList.length > 0;
    let oldDetails = [];
    try { oldDetails = JSON.parse(item.details); } catch(e) {}

    let criteriaFieldsHtml = '';
    if (isCriteriaBased) {
        criteriaFieldsHtml += `<div class="criteria-container">`;
        criteriaList.forEach((c,i) => {
            let pts = parseInt(c.points) || 0;
            // Eski puanı bul
            let oldScore = pts; 
            let oldNote = '';
            let detailMatch = oldDetails.find(d => d.q === c.text);
            if(detailMatch) { oldScore = detailMatch.score; oldNote = detailMatch.note || ''; }
            
            criteriaFieldsHtml += `
            <div class="criteria-row" id="row-${i}">
                <div class="criteria-header"><span>${c.text}</span><span style="font-size:0.8rem; color:#999;">Max: ${pts}</span></div>
                <div class="criteria-controls">
                    <input type="range" class="custom-range slider-input" id="slider-${i}" min="0" max="${pts}" value="${oldScore}" data-index="${i}" oninput="updateRowScore(${i}, ${pts})">
                    <span class="score-badge" id="badge-${i}" style="${oldScore<pts?'background:#d32f2f':''}">${oldScore}</span>
                </div>
                <input type="text" id="note-${i}" class="note-input" value="${oldNote}" placeholder="Kırılım nedeni..." style="display:${oldScore<pts?'block':'none'}; margin-top:5px;">
            </div>`;
        });
        criteriaFieldsHtml += `</div>`;
    } else {
        criteriaFieldsHtml = `
        <div style="padding:15px; border:1px dashed #ccc; background:#fff; margin-bottom:15px; text-align:center;">
            <label style="font-weight:bold;">Manuel Puan</label><br>
            <input id="eval-manual-score" type="number" class="swal2-input" value="${item.score}" min="0" max="100" style="width:100px; text-align:center; font-size:1.5rem; font-weight:bold;">
        </div>
        <textarea id="eval-details" class="swal2-textarea">${item.details}</textarea>`;
    }

    const { value: formValues } = await Swal.fire({
        title: 'Düzenle: ' + item.callId,
        html: `
        <div class="eval-modal-wrapper">
             <div class="score-dashboard" style="margin-bottom:10px;">
                 <div>
                    <div style="font-size:0.9rem; opacity:0.8;">DÜZENLENİYOR</div>
                    <div style="font-size:1.2rem; font-weight:bold; color:#fabb00;">${agentName}</div>
                 </div>
                 <div class="score-circle-outer" id="score-ring"><div class="score-circle-inner" id="live-score">${item.score}</div></div>
            </div>
            <input id="eval-callid" class="swal2-input" value="${item.callId}" disabled style="background:#eee;">
            ${criteriaFieldsHtml}
            <textarea id="eval-feedback" class="swal2-textarea" style="margin-top:10px; height:80px;">${item.feedback || ''}</textarea>
        </div>`,
        width: '650px',
        showCancelButton: true,
        confirmButtonText: 'Güncelle',
        didOpen: () => { if(isCriteriaBased) window.recalcTotalScore(); },
        preConfirm: () => {
             if (isCriteriaBased) {
                 let total = 0, detailsArr = [];
                 criteriaList.forEach((c, i) => {
                     let val = parseInt(document.getElementById(`slider-${i}`).value)||0;
                     let note = document.getElementById(`note-${i}`).value;
                     total += val;
                     detailsArr.push({ q: c.text, max: parseInt(c.points), score: val, note: note });
                 });
                 return { callId: item.callId, score: total, details: JSON.stringify(detailsArr), feedback: document.getElementById('eval-feedback').value };
             } else {
                 const score = parseInt(document.getElementById('eval-manual-score').value);
                 const details = document.getElementById('eval-details').value;
                 return { callId: item.callId, score, details, feedback: document.getElementById('eval-feedback').value };
             }
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Güncelleniyor...', didOpen: () => Swal.showLoading() });
        fetch(SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: "updateEvaluation", username: currentUser, token: getToken(), agentName, ...formValues })
        }).then(r=>r.json()).then(d => {
            if (d.result === "success") {
                Swal.fire({ icon: 'success', title: 'Güncellendi', timer: 1500, showConfirmButton: false });
                fetchEvaluationsForAgent(agentName);
            } else Swal.fire('Hata', d.message, 'error');
        });
    }
}

async function exportEvaluations() {
    if (!isAdminMode) return;
    const targetAgent = document.getElementById('agent-select-admin').value;
    Swal.fire({ title: 'Rapor Hazırlanıyor...', didOpen: () => Swal.showLoading() });
    fetch(SCRIPT_URL, {
        method: 'POST', headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "exportEvaluations", targetAgent, username: currentUser, token: getToken() })
    }).then(r=>r.json()).then(data => {
        if (data.result === "success" && data.csvData) {
            const blob = new Blob(["\ufeff" + data.csvData], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = data.fileName;
            document.body.appendChild(link); link.click(); document.body.removeChild(link);
            Swal.close();
        } else Swal.fire('Hata', 'Rapor alınamadı.', 'error');
    });
}

// --- PENALTY GAME FUNCTIONS (Orijinal Koddan Korundu) ---
function updateJokerButtons() {
    document.getElementById('joker-call').disabled = jokers.call === 0;
    document.getElementById('joker-half').disabled = jokers.half === 0;
    document.getElementById('joker-double').disabled = jokers.double === 0 || firstAnswerIndex !== -1;
    if (firstAnswerIndex !== -1) {
        document.getElementById('joker-call').disabled = true;
        document.getElementById('joker-half').disabled = true;
        document.getElementById('joker-double').disabled = true;
    }
}

function useJoker(type) {
    if (jokers[type] === 0 || (firstAnswerIndex !== -1 && type !== 'double')) return;
    jokers[type] = 0;
    updateJokerButtons();
    const currentQ = pCurrentQ, correctAns = currentQ.a, btns = document.querySelectorAll('.penalty-btn');
    
    if (type === 'call') {
        const experts = ["Umut Bey", "Doğuş Bey", "Deniz Bey", "Esra Hanım"];
        const expert = experts[Math.floor(Math.random() * experts.length)];
        let guess = correctAns;
        if (Math.random() > 0.8 && currentQ.opts.length > 1) {
            let incorrectOpts = currentQ.opts.map((_, i) => i).filter(i => i !== correctAns);
            guess = incorrectOpts[Math.floor(Math.random() * incorrectOpts.length)] || correctAns;
        }
        Swal.fire({ icon: 'info', title: '📞 Telefon Jokeri', html: `${expert} soruyu cevaplıyor...<br><br>"Benim tahminim kesinlikle **${String.fromCharCode(65 + guess)}** şıkkı. Bundan ${Math.random() < 0.8 ? "çok eminim" : "emin değilim"}."`, confirmButtonText: 'Kapat' });
    } else if (type === 'half') {
        let incorrectOpts = currentQ.opts.map((_, i) => i).filter(i => i !== correctAns).sort(() => Math.random() - 0.5).slice(0, 2);
        incorrectOpts.forEach(idx => {
            btns[idx].disabled = true;
            btns[idx].style.textDecoration = 'line-through';
            btns[idx].style.opacity = '0.4';
        });
        Swal.fire({ icon: 'success', title: '✂️ Yarı Yarıya Kullanıldı', text: 'İki yanlış şık elendi!', toast: true, position: 'top', showConfirmButton: false, timer: 1500 });
    } else if (type === 'double') {
        doubleChanceUsed = true;
        Swal.fire({ icon: 'warning', title: '2️⃣ Çift Cevap', text: 'Bu soruda bir kez yanlış cevap verme hakkınız var. İlk cevabınız yanlışsa, ikinci kez deneyebilirsiniz.', toast: true, position: 'top', showConfirmButton: false, timer: 2500 });
    }
}

function openPenaltyGame() {
    document.getElementById('penalty-modal').style.display = 'flex';
    showLobby();
}

function showLobby() {
    document.getElementById('penalty-lobby').style.display = 'flex';
    document.getElementById('penalty-game-area').style.display = 'none';
    fetchLeaderboard();
}

function startGameFromLobby() {
    document.getElementById('penalty-lobby').style.display = 'none';
    document.getElementById('penalty-game-area').style.display = 'block';
    startPenaltySession();
}

function fetchLeaderboard() {
    const tbody = document.getElementById('leaderboard-body'),
    loader = document.getElementById('leaderboard-loader'),
    table = document.getElementById('leaderboard-table');
    tbody.innerHTML = '';
    loader.style.display = 'block';
    table.style.display = 'none';
    
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "getLeaderboard" })
    }).then(response => response.json())
    .then(data => {
        loader.style.display = 'none';
        if (data.result === "success") {
            table.style.display = 'table';
            let html = '';
            if(data.leaderboard.length === 0) {
                html = '<tr><td colspan="4" style="text-align:center; color:#666;">Henüz maç yapılmadı.</td></tr>';
            } else {
                data.leaderboard.forEach((u, i) => {
                    let medal = i===0 ? '🥇' : (i===1 ? '🥈' : (i===2 ? '🥉' : `<span class="rank-badge">${i+1}</span>`));
                    let bgStyle = (u.username === currentUser) ? 'background:rgba(250, 187, 0, 0.1);' : '';
                    html += `<tr style="${bgStyle}"><td>${medal}</td><td style="text-align:left;">${u.username}</td><td>${u.games}</td><td>${u.average}</td></tr>`;
                });
            }
            tbody.innerHTML = html;
        } else {
            loader.innerText = "Yüklenemedi.";
            loader.style.display = 'block';
        }
    }).catch(err => {
        loader.innerText = "Bağlantı hatası.";
    });
}

function startPenaltySession() {
    pScore = 0;
    pBalls = 10;
    jokers = { call: 1, half: 1, double: 1 };
    doubleChanceUsed = false;
    firstAnswerIndex = -1;
    updateJokerButtons();
    document.getElementById('p-score').innerText = pScore;
    document.getElementById('p-balls').innerText = pBalls;
    document.getElementById('p-restart-btn').style.display = 'none';
    document.getElementById('p-options').style.display = 'grid';
    resetField();
    loadPenaltyQuestion();
}

function loadPenaltyQuestion() {
    if (pBalls <= 0) {
        finishPenaltyGame();
        return;
    }
    if (quizQuestions.length === 0) {
        Swal.fire('Hata', 'Soru yok!', 'warning');
        return;
    }
    pCurrentQ = quizQuestions[Math.floor(Math.random() * quizQuestions.length)];
    document.getElementById('p-question-text').innerText = pCurrentQ.q;
    doubleChanceUsed = false;
    firstAnswerIndex = -1;
    updateJokerButtons();
    let html = '';
    pCurrentQ.opts.forEach((opt, index) => {
        const letter = String.fromCharCode(65 + index);
        html += `<button class="penalty-btn" onclick="shootBall(${index})">${letter}: ${opt}</button>`;
    });
    document.getElementById('p-options').innerHTML = html;
}

function shootBall(idx) {
    const btns = document.querySelectorAll('.penalty-btn'),
    isCorrect = (idx === pCurrentQ.a);
    if (!isCorrect && doubleChanceUsed && firstAnswerIndex === -1) {
        firstAnswerIndex = idx;
        btns[idx].classList.add('wrong-first-try');
        btns[idx].disabled = true;
        Swal.fire({ toast: true, position: 'top', icon: 'info', title: 'İlk Hata! Kalan Hakkınız: 1', showConfirmButton: false, timer: 1500, background: '#ffc107' });
        updateJokerButtons();
        return;
    }
    btns.forEach(b => b.disabled = true);
    
    const ballWrap = document.getElementById('ball-wrap'),
    keeperWrap = document.getElementById('keeper-wrap'),
    shooterWrap = document.getElementById('shooter-wrap'),
    goalMsg = document.getElementById('goal-msg');
    
    const shotDir = Math.floor(Math.random() * 4);
    shooterWrap.classList.add('shooter-run');
    
    setTimeout(() => {
        if(isCorrect) {
            if(shotDir === 0 || shotDir === 2) keeperWrap.classList.add('keeper-dive-right');
            else keeperWrap.classList.add('keeper-dive-left');
        } else {
            if(shotDir === 0 || shotDir === 2) keeperWrap.classList.add('keeper-dive-left');
            else keeperWrap.classList.add('keeper-dive-right');
        }
        
        if (isCorrect) {
            if(shotDir === 0) ballWrap.classList.add('ball-shoot-left-top');
            else if(shotDir === 1) ballWrap.classList.add('ball-shoot-right-top');
            else if(shotDir === 2) ballWrap.classList.add('ball-shoot-left-low');
            else ballWrap.classList.add('ball-shoot-right-low');
            
            setTimeout(() => {
                goalMsg.innerText = "GOL!!!";
                goalMsg.style.color = "#fabb00";
                goalMsg.classList.add('show');
                pScore++;
                document.getElementById('p-score').innerText = pScore;
                Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Mükemmel Şut!', showConfirmButton: false, timer: 1000, background: '#a5d6a7' });
            }, 500);
        } else {
            if(Math.random() > 0.5) {
                ballWrap.style.bottom = "160px";
                ballWrap.style.left = (shotDir === 0 || shotDir === 2) ? "40%" : "60%";
                ballWrap.style.transform = "scale(0.6)";
                setTimeout(() => {
                    goalMsg.innerText = "KURTARDI!";
                    goalMsg.style.color = "#ef5350";
                    goalMsg.classList.add('show');
                    Swal.fire({ icon: 'error', title: 'Kaçırdın!', text: `Doğru cevap: ${String.fromCharCode(65 + pCurrentQ.a)}. ${pCurrentQ.opts[pCurrentQ.a]}`, showConfirmButton: true, timer: 2500, background: '#ef9a9a' });
                }, 500);
            } else {
                ballWrap.classList.add(Math.random() > 0.5 ? 'ball-miss-left' : 'ball-miss-right');
                setTimeout(() => {
                    goalMsg.innerText = "DIŞARI!";
                    goalMsg.style.color = "#ef5350";
                    goalMsg.classList.add('show');
                    Swal.fire({ icon: 'error', title: 'Kaçırdın!', text: `Doğru cevap: ${String.fromCharCode(65 + pCurrentQ.a)}. ${pCurrentQ.opts[pCurrentQ.a]}`, showConfirmButton: true, timer: 2500, background: '#ef9a9a' });
                }, 500);
            }
        }
    }, 300);
    pBalls--;
    document.getElementById('p-balls').innerText = pBalls;
    setTimeout(() => {
        resetField();
        loadPenaltyQuestion();
    }, 2500);
}

function resetField() {
    const ballWrap = document.getElementById('ball-wrap'),
    keeperWrap = document.getElementById('keeper-wrap'),
    shooterWrap = document.getElementById('shooter-wrap'),
    goalMsg = document.getElementById('goal-msg');
    
    ballWrap.className = 'ball-wrapper';
    ballWrap.style = "";
    keeperWrap.className = 'keeper-wrapper';
    shooterWrap.className = 'shooter-wrapper';
    goalMsg.classList.remove('show');
    
    document.querySelectorAll('.penalty-btn').forEach(b => {
        b.classList.remove('wrong-first-try');
        b.style.textDecoration = '';
        b.style.opacity = '';
        b.style.background = '#fabb00';
        b.style.color = '#0e1b42';
        b.style.borderColor = '#f0b500';
        b.disabled = false;
    });
}

function finishPenaltyGame() {
    let title = pScore >= 8 ? "EFSANE! 🏆" : (pScore >= 5 ? "İyi Maçtı! 👏" : "Antrenman Lazım 🤕");
    document.getElementById('p-question-text').innerHTML = `<span style="font-size:1.5rem; color:#fabb00;">MAÇ BİTTİ!</span><br>${title}<br>Toplam Skor: ${pScore}/10`;
    document.getElementById('p-options').style.display = 'none';
    document.getElementById('p-restart-btn').style.display = 'block';
    
    fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "logQuiz", username: currentUser, token: getToken(), score: pScore * 10, total: 100 })
    });
}

// --- WIZARD FONKSİYONLARI (Orijinal - Korumalı) ---
function openWizard(){
    document.getElementById('wizard-modal').style.display='flex';
    if (Object.keys(wizardStepsData).length === 0) {
        Swal.fire({ title: 'İade Asistanı Verisi Yükleniyor...', didOpen: () => Swal.showLoading() });
        loadWizardData().then(() => {
            Swal.close();
            if (wizardStepsData && wizardStepsData['start']) {
                renderStep('start');
            } else {
                document.getElementById('wizard-body').innerHTML = '<h2 style="color:red;">Asistan verisi eksik veya hatalı.</h2>';
            }
        }).catch(() => {
            Swal.close();
            document.getElementById('wizard-body').innerHTML = '<h2 style="color:red;">Sunucudan veri çekme hatası.</h2>';
        });
    } else {
        renderStep('start');
    }
}

function renderStep(k){
    const s = wizardStepsData[k];
    if (!s) {
        document.getElementById('wizard-body').innerHTML = `<h2 style="color:red;">HATA: Adım ID'si (${k}) bulunamadı.</h2>`;
        return;
    }
    const b = document.getElementById('wizard-body');
    let h = `<h2 style="color:var(--primary);">${s.title || ''}</h2>`;
    
    if(s.result) {
        let i = s.result === 'red' ? '🛑' : (s.result === 'green' ? '✅' : '⚠️');
        let c = s.result === 'red' ? 'res-red' : (s.result === 'green' ? 'res-green' : 'res-yellow');
        h += `<div class="result-box ${c}"><div style="font-size:3rem;margin-bottom:10px;">${i}</div><h3>${s.title}</h3><p>${s.text}</p>${s.script ? `<div class="script-box">${s.script}</div>` : ''}</div><button class="restart-btn" onclick="renderStep('start')"><i class="fas fa-redo"></i> Başa Dön</button>`;
    } else {
        h += `<p>${s.text}</p><div class="wizard-options">`;
        s.options.forEach(o => {
            h += `<button class="option-btn" onclick="renderStep('${o.next}')"><i class="fas fa-chevron-right"></i> ${o.text}</button>`;
        });
        h += `</div>`;
        if(k !== 'start')
            h += `<button class="restart-btn" onclick="renderStep('start')" style="background:#eee;color:#333;margin-top:15px;">Başa Dön</button>`;
    }
    b.innerHTML = h;
}

// --- BOŞ YER TUTUCULAR (Hata önlemek için) ---
function changePasswordPopup(force) { 
    Swal.fire({
        title: 'Şifre Değiştir',
        html: '<input id="swal-old-pass" type="password" class="swal2-input" placeholder="Eski Şifre"><input id="swal-new-pass" type="password" class="swal2-input" placeholder="Yeni Şifre">',
        showCancelButton: !force,
        confirmButtonText: 'Değiştir',
        preConfirm: () => {
            const o = document.getElementById('swal-old-pass').value;
            const n = document.getElementById('swal-new-pass').value;
            if(!o || !n) Swal.showValidationMessage('Eksik alan!');
            return {o, n};
        }
    }).then(res => {
        if(res.isConfirmed) {
            Swal.showLoading();
            fetch(SCRIPT_URL, {
                method: 'POST', body: JSON.stringify({ action: "changePassword", username: currentUser, oldPass: CryptoJS.SHA256(res.value.o).toString(), newPass: CryptoJS.SHA256(res.value.n).toString(), token: getToken() })
            }).then(r=>r.json()).then(d=>{
                if(d.result==="success") Swal.fire('Başarılı').then(()=>logout());
                else Swal.fire('Hata', d.message, 'error');
            });
        }
    });
}

/* --- YENİ EKLENEN DASHBOARD CSS --- */

.dash-grid-container {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 20px;
}

.dash-card {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #f0f0f0;
    transition: transform 0.2s;
    position: relative;
    overflow: hidden;
}
.dash-card:hover { transform: translateY(-2px); }

.dash-card-icon {
    position: absolute;
    top: 15px;
    right: 15px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    opacity: 0.2;
}

.dash-card-title { font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
.dash-card-value { font-size: 2.5rem; font-weight: 800; color: #0e1b42; margin-top: 5px; }
.dash-card-sub { font-size: 0.8rem; color: #94a3b8; margin-top: 5px; }

.dash-main-area {
    grid-column: span 3;
    display: grid;
    grid-template-columns: 2fr 1fr; /* Sol geniş, Sağ dar */
    gap: 20px;
    height: 500px; /* Sabit yükseklik */
}

/* Ortak Kutu Stili */
.dash-chart-box, .dash-list-box {
    background: white;
    border-radius: 12px;
    border: 1px solid #f0f0f0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
}

.dash-list-header {
    padding: 15px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 700;
    color: #0f172a;
    background: #fff;
}

.dash-list-content {
    overflow-y: auto;
    flex-grow: 1;
    padding: 10px;
    background: #f8fafc;
}

/* Liste Elemanları */
.dash-list-item {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 15px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}

.dash-list-item:hover {
    border-color: #cbd5e1;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transform: translateX(2px);
}

.dash-score-badge {
    padding: 6px 12px;
    border-radius: 6px;
    font-weight: 800;
    font-size: 0.9rem;
    min-width: 40px;
    text-align: center;
}

.score-green { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
.score-yellow { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
.score-red { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

/* Sağdaki Grup Sıralaması Tablosu İçin Stil */
.ranking-table { 
    width: 100%; 
    border-collapse: collapse; 
    font-size: 0.85rem; 
}
.ranking-table th, .ranking-table td { 
    padding: 10px; 
    text-align: left; 
    border-bottom: 1px solid #f1f5f9; 
}
.ranking-table th { 
    font-weight: 600; 
    color: #64748b; 
    background: #f8fafc; 
    position: sticky; 
    top: 0; 
    z-index: 1; 
}
.ranking-table td:last-child { 
    text-align: right; 
    font-weight: bold; 
}
.ranking-table tr:last-child td { 
    border-bottom: none; 
}

@media (max-width: 900px) {
    .dash-grid-container { grid-template-columns: 1fr; }
    .dash-main-area { grid-template-columns: 1fr; height: auto; }
    .dash-chart-box, .dash-list-box { height: 400px; margin-bottom: 20px; }
}
